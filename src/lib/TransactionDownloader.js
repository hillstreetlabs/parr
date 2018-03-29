import Eth from "ethjs";
import upsert from "../util/upsert";
import { Ethmoji } from "ethmoji-contracts";

const ADDRESS_TO_ABI = {
  "0xa6d954d08877f8ce1224f6bfb83484c7d3abf8e9": Ethmoji.abi
};

const BATCH_SIZE = 50;
const DELAY = 5000;

export default class TransactionDownloader {
  constructor(db) {
    this.db = db;
    this.timer;
    this.pid = `TransactionDownloader@${process.pid}`;
  }

  async run() {
    let transactionHashes = await this.getTransactionHashes();
    if (transactionHashes.length > 0) {
      await this.importTransactions(transactionHashes);
      this.run();
    } else {
      console.log(`No imported transactions found, waiting ${DELAY}ms`);
      this.timer = setTimeout(() => this.run(), DELAY);
    }
  }

  async exit() {
    console.log("Exiting...");
    clearTimeout(this.timer);
    const unlocked = await this.db.pg
      .select()
      .from("transactions")
      .where({ locked_by: this.pid })
      .returning("hash")
      .update({
        locked_by: null,
        locked_at: null
      });
    console.log(`Unlocked ${unlocked.length} transactions`);
    process.exit();
  }

  getTransactionHashes() {
    return this.db.pg.transaction(async trx => {
      const transactions = await trx
        .select()
        .from("transactions")
        .where({ status: "imported", locked_by: null })
        .limit(BATCH_SIZE);
      const hashes = await trx
        .select()
        .from("transactions")
        .whereIn("hash", transactions.map(transaction => transaction.hash))
        .returning("hash")
        .update({
          locked_by: this.pid,
          locked_at: this.db.pg.fn.now()
        });
      return hashes;
    });
  }

  async importTransactions(transactionHashes) {
    await Promise.all(
      transactionHashes.map(hash => {
        return this.importTransaction(hash);
      })
    );
  }

  async importTransaction(transactionHash) {
    try {
      const receipt = await this.db.web3.getTransactionReceipt(transactionHash);

      const logs = await this.importLogs(receipt.to, receipt.logs);

      const transaction = await upsert(
        this.db.pg,
        "transactions",
        this.transactionJson(receipt),
        "(hash)"
      );

      console.log(`Downloaded transaction ${transaction.hash}`);
    } catch (err) {
      console.log(
        `Failed to getTransactionReceipt for ${transactionHash}, un-locking...`
      );
      return this.unlockTransaction(transactionHash);
    }
  }

  async unlockTransaction(hash) {
    const unlocked = await upsert(
      this.db.pg,
      "transactions",
      {
        hash,
        locked_by: null,
        locked_at: null
      },
      "(hash)"
    );
    return unlocked;
  }

  async importLogs(toAddress, logs) {
    let decoded;
    if (toAddress in ADDRESS_TO_ABI) {
      try {
        const decoder = Eth.abi.logDecoder(ADDRESS_TO_ABI[toAddress]);
        decoded = decoder(logs);
      } catch (error) {
        decoded = [];
      }
    } else {
      decoded = [];
    }
    return Promise.all(
      logs.map((log, index) => {
        return this.importLog(log, decoded[index]);
      })
    );
  }

  async importLog(log, decoded) {
    const saved = await upsert(
      this.db.pg,
      "logs",
      this.logJson(log, decoded),
      "(transaction_hash, log_index)"
    );
    console.log(`Downloaded log ${log.transactionHash}:${log.logIndex}`);
  }

  logJson(log, decoded = {}) {
    return {
      transaction_hash: log.transactionHash,
      log_index: log.logIndex.toNumber(),
      status: "downloaded",
      decoded: decoded,
      data: {
        address: log.address,
        data: log.data,
        blockHash: log.blockHash,
        blockNumber: log.blockNumber.toString(10),
        removed: log.removed,
        transactionIndex: log.transactionIndex.toString(10)
      }
    };
  }

  transactionJson(receipt) {
    return {
      hash: receipt.transactionHash,
      status: "downloaded",
      locked_by: null,
      locked_at: null,
      downloaded_by: this.pid,
      downloaded_at: this.db.pg.fn.now(),
      receipt: {
        blockHash: receipt.blockHash,
        blockNumber: receipt.blockNumber.toNumber(),
        contractAddress: receipt.contractAddress,
        cumulativeGasUsed: receipt.cumulativeGasUsed.toString(10),
        from: receipt.from,
        gasUsed: receipt.gasUsed.toString(10),
        to: receipt.to,
        logsBloom: receipt.logsBloom,
        status: receipt.status,
        transactionIndex: receipt.transactionIndex
      }
    };
  }
}
