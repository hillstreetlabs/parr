import uuid from "uuid";
import omit from "lodash/omit";
import { logJson, transactionJson } from "../util/esJson";
import createTimer from "../util/createTimer";
import { observable, autorun } from "mobx";
import { Line, LineBuffer, Clear } from "clui";

const BATCH_SIZE = 50;
const DELAY = 5000;

export default class TransactionIndexer {
  @observable indexedTransactions = 0;
  @observable indexedLogs = 0;
  @observable indexedInternalTransactions = 0;

  constructor(db) {
    this.db = db;
    this.timeout;
    this.timer = createTimer();
    this.pid = `TransactionIndexer@${uuid.v4()}`;

    this.stopPrintingStats = autorun(() => this.printStats());
  }

  async run() {
    if (this.isExiting) return;

    let transactions = await this.getTransactions();
    if (transactions.length > 0) {
      await Promise.all(
        transactions.map(transaction => this.indexTransaction(transaction))
      );
      this.run();
    } else {
      console.log(`No downloaded transactions found, waiting ${DELAY}ms`);
      this.timeout = setTimeout(() => this.run(), DELAY);
    }
  }

  async exit() {
    this.isExiting = true;
    console.log("Exiting...");
    clearTimeout(this.timeout);
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
    this.stopPrintingStats();
    process.exit();
  }

  getTransactions() {
    const timer = this.timer.time("getTransactions");
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
      timer.stop();
      return transactions;
    });
  }

  async indexTransaction(transaction) {
    try {
      transaction = await this.fetchTransactionData(transaction);
      const esTimer = this.timer.time("indexing");
      await Promise.all([
        this.db.elasticsearch.bulkIndex(
          "logs",
          "log",
          transaction.logs.map(log =>
            Object.assign(log, { block: transaction.block })
          )
        ),
        this.db.elasticsearch.bulkIndex(
          "transactions",
          "transaction",
          transactionJson(transaction)
        )
      ]);
      esTimer.stop();
      const pgTimer = this.timer.time("unlocking");
      await Promise.all([
        this.db
          .pg("logs")
          .where({ transaction_hash: transaction.hash })
          .update({
            status: "indexed",
            indexed_by: this.pid,
            indexed_at: this.db.pg.fn.now()
          }),
        this.db
          .pg("transactions")
          .where({ hash: transaction.hash })
          .update({
            status: "indexed",
            locked_by: null,
            locked_at: null,
            indexed_by: this.pid,
            indexed_at: this.db.pg.fn.now()
          })
      ]);
      pgTimer.stop();
      this.indexedTransactions++;
      this.indexedLogs += transaction.logs.length;
      this.prepareBlockForIndexing(transaction.block);
    } catch (error) {
      console.log(`Failed to index transaction ${transaction.hash}`, error);
      return this.unlockTransaction(transaction.hash);
    }
  }

  async fetchTransactionData(transaction) {
    const timer = this.timer.time("fetchTransactionData");
    transaction.block = await this.db
      .pg("blocks")
      .where({ hash: transaction.data.blockHash })
      .first();

    transaction.logs = await this.db
      .pg("logs")
      .where({ transaction_hash: transaction.hash });

    timer.stop();
    return transaction;
  }

  async prepareBlockForIndexing(block) {
    const timer = this.timer.time("prepareBlockForIndexing");
    const transactionCountResult = await this.db
      .pg("transactions")
      .where({ status: "indexed", block_hash: block.data.hash })
      .count();
    const transactionCount = parseInt(transactionCountResult[0].count);

    if (block.data.transactionCount !== transactionCount) {
      timer.stop();
      return true;
    }

    await this.db.pg
      .from("blocks")
      .where({ hash: block.hash })
      .update({
        status: "indexable"
      });
    timer.stop();
  }

  async unlockTransaction(hash) {
    const timer = this.timer.time("unlocking");
    const unlocked = await this.db
      .pg("transactions")
      .where("hash", hash)
      .returning("hash")
      .update({ locked_by: null, locked_at: null });
    timer.stop();
    return unlocked;
  }

  printStats() {
    Clear();
    const outputBuffer = new LineBuffer({
      x: 0,
      y: 0,
      width: "console",
      height: "console"
    });
    const statHeaders = new Line(outputBuffer);
    const statValues = new Line(outputBuffer);
    const times = this.timer.get();
    Object.keys(times).forEach(key => {
      statHeaders.column(key, 20);
      statValues.column(
        Math.floor(times[key] / this.indexedTransactions) + " ms/t",
        20
      );
    });
    statHeaders.fill().output();
    statValues.fill().output();
    new Line(outputBuffer)
      .column("Transactions", 20)
      .column("Logs", 20)
      .fill()
      .output();
    new Line(outputBuffer)
      .column(`${this.indexedTransactions}`, 20)
      .column(`${this.indexedLogs}`, 20)
      .fill()
      .output();
    outputBuffer.output();
  }
}
