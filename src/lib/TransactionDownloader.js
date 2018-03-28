import Eth from "ethjs";
import upsert from "../util/upsert";
import { Ethmoji } from "ethmoji-contracts";

const ADDRESS_TO_ABI = {
  "0xa6d954d08877f8ce1224f6bfb83484c7d3abf8e9": Ethmoji.abi
};

const BATCH_SIZE = 4;

export default class TransactionDownloader {
  constructor(db) {
    this.db = db;
    this.timer;
    this.pid = `downloader@${process.pid}`;
  }

  async run(delay = 1000) {
    let transactions = await this.getTransactions();

    if (transactions.length > 0) {
      await this.importTransactions(transactions);
      this.run();
    } else {
      console.log(`No imported transactions found, waiting ${delay}ms`);
      this.timer = setTimeout(() => this.run(delay * 1.5), delay);
    }
  }

  async exit() {
    console.log("Exiting...");
    clearTimeout(this.timer);
    const unlocked = await this.db.pg
      .select()
      .from("blocks")
      .where({ locked_by: this.pid })
      .returning("number")
      .update({ locked_by: null, locked_at: null });
    console.log(`Unlocked ${unlocked.length} blocks`);
    process.exit();
  }

  getTransactions() {
    return this.db.pg.transaction(async trx => {
      const txns = await trx
        .select()
        .from("transactions")
        .where({ status: "imported" })
        .limit(BATCH_SIZE);

      const hashes = txns.map(txn => txn.hash);

      trx
        .select()
        .from("transactions")
        .whereIn("hash", hashes)
        .update({
          locked_by: this.pid,
          locked_at: this.db.pg.fn.now()
        });

      return txns;
    });
  }

  async importTransactions(transactions) {
    await Promise.all(
      transactions.map(transaction => {
        return this.importTransaction(transaction);
      })
    );
  }

  async importTransaction(transaction) {
    const receipt = await this.db.web3.getTransactionReceipt(transaction.hash);

    let decoded;

    if (transaction.to in ADDRESS_TO_ABI) {
      try {
        const decoder = Eth.abi.logDecoder(ADDRESS_TO_ABI[transaction.to]);
        decoded = decoder(receipt.logs);
      } catch (error) {
        decoded = [];
      }
    } else {
      decoded = [];
    }

    const logs = receipt.logs.map((log, index) => {
      return this.parseLog(log, decoded[index]);
    });

    const savedTransaction = await upsert(
      this.db.pg,
      "transactions",
      this.transactionJson(transaction, receipt, logs),
      "(hash)"
    );

    console.log(`Downloaded transaction ${transaction.hash}`);
    return true;
  }

  parseLog(log, decoded = {}) {
    return {
      address: log.address,
      data: log.data,
      blockHash: log.blockHash,
      blockNumber: log.blockNumber.toString(10),
      logIndex: log.logIndex.toString(10),
      removed: log.removed,
      transactionHash: log.transactionHash,
      transactionIndex: log.transactionIndex.toString(10),
      decoded: decoded || {}
    };
  }

  transactionJson(transaction, receipt, logs = []) {
    const { data } = transaction;

    return {
      hash: transaction.hash,
      status: "downloaded",
      data: {
        blockHash: data.blockHash,
        blockNumber: data.blockNumber,
        cumulativeGasUsed: receipt.cumulativeGasUsed.toString(10),
        from: data.from,
        gas: data.gas,
        gasPrice: data.gasPrice,
        gasUsed: receipt.gasUsed.toString(10),
        nonce: data.nonce,
        to: data.to,
        transactionIndex: data.transactionIndex,
        value: data.value,
        logs: logs || []
      }
    };
  }
}
