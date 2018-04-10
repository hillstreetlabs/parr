import uuid from "uuid";
import Eth from "ethjs";
import upsert from "../util/upsert";
import withTimeout from "../util/withTimeout";

const BATCH_SIZE = 5;
const DELAY = 5000;

export default class InternalTransactionDownloader {
  constructor(db) {
    this.db = db;
    this.timer;
    this.pid = `InternalTransactionDownloader@${uuid.v4()}`;
  }

  async run() {
    let transactions = await this.getTransactions();
    if (transactions.length > 0) {
      await this.processTransactions(transactions);
      this.run();
    } else {
      console.log(`No ready transactions found, waiting ${DELAY}ms`);
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

  getTransactions() {
    return this.db.pg.transaction(async trx => {
      const transactions = await trx
        .select()
        .from("transactions")
        .where({ status: "downloaded", locked_by: null })
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
      return transactions;
    });
  }

  async processTransactions(transactions) {
    await Promise.all(
      transactions.map(transaction => {
        return this.importInternalTransactions(transaction);
      })
    );
  }

  async importInternalTransactions(transaction) {
    let response;
    try {
      response = await withTimeout(
        this.db.etherscan.account.txlistinternal(transaction.hash),
        5000
      );
    } catch (error) {
      if (error === "No transactions found") {
        console.log(
          `No internal transactions found for transaction ${transaction.hash}`
        );
        return await this.updateTransactionStatusTo(
          transaction.hash,
          "indexable"
        );
      }

      console.log(
        `Error downloading internal transactions for transaction ${
          transaction.hash
        }`
      );
      return this.updateTransactionStatusTo(transaction.hash, "downloaded");
    }

    const internalTransactions = response.result.map(
      (internalTransaction, index) => {
        return this.internalTransactionJson(
          internalTransaction,
          transaction,
          index
        );
      }
    );

    await this.db.pg("internal_transactions").insert(internalTransactions);

    console.log(
      `Downloaded ${
        internalTransactions.length
      } internal transaction(s) from transaction ${transaction.hash}`
    );

    return this.updateTransactionStatusTo(transaction.hash, "indexable");
  }

  async updateTransactionStatusTo(hash, status) {
    return await this.db
      .pg("transactions")
      .where({ hash: hash })
      .update({
        status: status,
        locked_by: null,
        locked_at: null
      });
  }

  internalTransactionJson(internalTransaction, transaction, index) {
    return {
      internal_transaction_index: index,
      block_hash: transaction.block_hash,
      transaction_hash: transaction.hash,
      from_address: internalTransaction.from,
      to_address: internalTransaction.to,
      status: "downloaded",
      downloaded_by: this.pid,
      downloaded_at: this.db.pg.fn.now(),
      data: {
        blockNumber: internalTransaction.blockNumber.toString(10),
        timestamp: internalTransaction.timeStamp,
        value: Eth.fromWei(internalTransaction.value, "ether"),
        contractAddress: internalTransaction.contractAddress,
        input: internalTransaction.input,
        type: internalTransaction.type,
        gas: internalTransaction.gas.toString(10),
        gasUsed: internalTransaction.gasUsed.toString(10),
        isError: internalTransaction.isError === "0" ? false : true,
        errCode: internalTransaction.errCode
      }
    };
  }
}
