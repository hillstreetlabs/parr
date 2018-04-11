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
      await this.indexTransactions(transactions);
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
    await this.unlockTransactions();
    this.stopPrintingStats();
    process.exit();
  }

  async unlockTransactions() {
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

  async indexTransactions(transactions) {
    try {
      const fetchTimer = this.timer.time("fetching");
      const transactionsData = await Promise.all(
        transactions.map(transaction => this.fetchTransactionData(transaction))
      );
      fetchTimer.stop();
      const indexTimer = this.timer.time("indexing");
      await this.indexAsTransactions(transactionsData);
      await this.indexAsFromTransactions(transactionsData);
      await this.indexAsToTransactions(transactionsData);
      indexTimer.stop();
      const updateTimer = this.timer.time("updating");
      const updated = await this.db
        .pg("transactions")
        .whereIn("hash", transactions.map(transaction => transaction.hash))
        .returning("hash")
        .update({
          status: "indexed",
          locked_by: null,
          locked_at: null,
          indexed_by: this.pid,
          indexed_at: this.db.pg.fn.now()
        });
      updateTimer.stop();
      this.indexedTransactions += updated.length;
    } catch (err) {
      console.log(`Failed to index transactions`, err);
      return this.unlockTransactions();
    }
  }

  async indexAsTransactions(transactions) {
    const transactionsJson = transactions.map(transaction => {
      transaction.type = "transaction";
      transaction.join_field = {
        name: "transaction",
        parent: `block:${transaction.block_hash}`
      };
      transaction.routing = transaction.block_hash;
      return transactionJson(transaction);
    });
    const indexed = await this.db.elasticsearch.bulkIndex(
      "parr_blocks_transactions",
      transactionsJson
    );
    if (indexed.errors) throw JSON.stringify(indexed);
    return indexed;
  }

  async indexAsFromTransactions(transactions) {
    const transactionsJson = transactions.map(transaction => {
      transaction.type = "from_transaction";
      transaction.join_field = {
        name: "from_transaction",
        parent: `address:${transaction.from.address}`
      };
      transaction.routing = transaction.from.address;
      return transactionJson(transaction);
    });
    const indexed = await this.db.elasticsearch.bulkIndex(
      "parr_addresses",
      transactionsJson
    );
    if (indexed.errors) throw JSON.stringify(indexed);
    return indexed;
  }

  async indexAsToTransactions(transactions) {
    const transactionsJson = transactions.map(transaction => {
      transaction.type = "to_transaction";
      transaction.join_field = {
        name: "to_transaction",
        parent: `address:${transaction.to.address}`
      };
      transaction.routing = transaction.to.address;
      return transactionJson(transaction);
    });
    const indexed = await this.db.elasticsearch.bulkIndex(
      "parr_addresses",
      transactionsJson
    );
    if (indexed.errors) throw JSON.stringify(indexed);
    return indexed;
  }

  async fetchTransactionData(transaction) {
    const timer = this.timer.time("fetchTransactionData");
    transaction.from = await this.db
      .pg("addresses")
      .where({ address: transaction.from_address })
      .first();
    transaction.to = await this.db
      .pg("addresses")
      .where({ address: transaction.to_address })
      .first();
    transaction.block = await this.db
      .pg("blocks")
      .where({ hash: transaction.block_hash })
      .first();
    transaction.logs = await this.db
      .pg("logs")
      .where({ transaction_hash: transaction.hash });
    timer.stop();
    return transaction;
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
