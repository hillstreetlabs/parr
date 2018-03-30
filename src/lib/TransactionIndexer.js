import { logJson, transactionJson } from "../util/esJson";

const BATCH_SIZE = 50;
const DELAY = 5000;

export default class TransactionIndexer {
  constructor(db) {
    this.db = db;
    this.timer;
    this.pid = `TransactionIndexer@${process.pid}`;
  }

  async run() {
    let transactions = await this.getTransactions();
    if (transactions.length > 0) {
      await this.indexTransactions(transactions);
      this.run();
    } else {
      console.log(`No downloaded transactions found, waiting ${DELAY}ms`);
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

  async indexTransactions(transactions) {
    await Promise.all(
      transactions.map(transaction => this.indexTransaction(transaction))
    );
  }

  async indexTransaction(transaction) {
    try {
      transaction = await this.fetchTransactionData(transaction);
      const parsedTransaction = transactionJson(transaction);

      // Index logs and update status
      await this.db.elasticsearch.bulkIndex(
        "logs",
        "log",
        parsedTransaction.logs
      );
      await this.db
        .pg("logs")
        .where({ transaction_hash: transaction.hash })
        .update({
          status: "indexed",
          indexed_by: this.pid,
          indexed_at: this.db.pg.fn.now()
        });

      // Index transactions and update status
      await this.db.elasticsearch.bulkIndex(
        "transactions",
        "transaction",
        parsedTransaction
      );
      await this.db
        .pg("transactions")
        .where({ hash: transaction.hash })
        .update({
          status: "indexed",
          locked_by: null,
          locked_at: null,
          indexed_by: this.pid,
          indexed_at: this.db.pg.fn.now()
        });
      console.log(`Indexed transaction ${transaction.hash}`);

      await this.prepareBlockForIndexing(transaction.block);
    } catch (error) {
      console.log(`Failed to index transaction ${transaction.hash}`, error);
      return this.unlockTransaction(transaction.hash);
    }
  }

  async fetchTransactionData(transaction) {
    transaction.block = await this.db
      .pg("blocks")
      .where({ hash: transaction.data.blockHash })
      .first();

    transaction.logs = await this.db
      .pg("logs")
      .where({ transaction_hash: transaction.hash });

    return transaction;
  }

  parseTransactionData(transaction, block, logs) {
    const parsedTransaction = transactionJson(transaction, block, logs);
    const parsedLogs = logs.map(log => {
      return logJson(log, block);
    });

    return { parsedTransaction, parsedLogs };
  }

  async prepareBlockForIndexing(block) {
    const transactions = await this.db
      .pg("transactions")
      .where({ status: "indexed", block_hash: block.data.hash });

    if (block.data.transactionCount !== transactions.length) return true;

    await this.db.pg
      .from("blocks")
      .where({ hash: block.hash })
      .update({
        status: "indexable"
      });
  }

  async unlockTransaction(hash) {
    const unlocked = await this.db
      .pg("transactions")
      .where("hash", hash)
      .returning("hash")
      .update({ locked_by: null, locked_at: null });
    return unlocked;
  }
}
