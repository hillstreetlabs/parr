import { internalTransactionJson } from "../util/esJson";

const BATCH_SIZE = 50;
const DELAY = 5000;

export default class InternalTransactionIndexer {
  constructor(db) {
    this.db = db;
    this.timer;
    this.pid = `InternalTransactionIndexer@${process.pid}`;
  }

  async run() {
    let internalTransactions = await this.getInternalTransactions();
    if (internalTransactions.length > 0) {
      await this.indexInternalTransactions(internalTransactions);
      this.run();
    } else {
      console.log(
        `No indexable internal transactions found, waiting ${DELAY}ms`
      );
      this.timer = setTimeout(() => this.run(), DELAY);
    }
  }

  async exit() {
    console.log("Exiting...");
    clearTimeout(this.timer);
    const unlocked = await this.db.pg
      .select()
      .from("internal_transactions")
      .where({ locked_by: this.pid })
      .returning("id")
      .update({
        locked_by: null,
        locked_at: null
      });
    console.log(`Unlocked ${unlocked.length} internal transactions`);
    process.exit();
  }

  getInternalTransactions() {
    return this.db.pg.transaction(async trx => {
      const transactions = await trx
        .select()
        .from("internal_transactions")
        .where({ status: "downloaded", locked_by: null })
        .limit(BATCH_SIZE);
      await trx
        .select()
        .from("internal_transactions")
        .whereIn("id", transactions.map(transaction => transaction.id))
        .update({
          locked_by: this.pid,
          locked_at: this.db.pg.fn.now()
        });
      return transactions;
    });
  }

  async indexInternalTransactions(internalTransactions) {
    await Promise.all(
      internalTransactions.map(internalTransaction =>
        this.indexInternalTransaction(internalTransaction)
      )
    );
  }

  async fetchData(internalTransaction) {
    internalTransaction.transaction = await this.db
      .pg("transactions")
      .where({ hash: internalTransaction.transaction_hash })
      .first();
    internalTransaction.fromAddress = await this.db
      .pg("addresses")
      .where({ address: internalTransaction.from_address })
      .first();
    internalTransaction.toAddress = await this.db
      .pg("addresses")
      .where({ address: internalTransaction.to_address })
      .first();
    internalTransaction.block = await this.db
      .pg("blocks")
      .where({ hash: internalTransaction.block_hash })
      .first();
    return internalTransaction;
  }

  async indexInternalTransaction(internalTransaction) {
    try {
      await this.db.elasticsearch.bulkIndex(
        "internal-transactions",
        "internal-transaction",
        internalTransactionJson(await this.fetchData(internalTransaction))
      );

      await this.db
        .pg("internal_transactions")
        .where({ id: internalTransaction.id })
        .update({
          status: "indexed",
          locked_by: null,
          locked_at: null,
          indexed_by: this.pid,
          indexed_at: this.db.pg.fn.now()
        });

      console.log(`Indexed internal transaction ${internalTransaction.id}`);
    } catch (error) {
      console.log(
        `Failed to index internal transaction ${internalTransaction.id}`,
        error
      );
      return await this.unlockInternalTransaction(internalTransaction.id);
    }
  }

  async unlockInternalTransaction(id) {
    const unlocked = await this.db
      .pg("internal_transactions")
      .where("id", id)
      .returning("id")
      .update({ locked_by: null, locked_at: null });
    return unlocked;
  }
}
