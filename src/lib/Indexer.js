import upsert from "../util/upsert";

const BATCH_SIZE = 2;

export default class Indexer {
  constructor(db, options) {
    this.db = db;
    this.timer;
    this.pid = `Indexer@${process.pid}`;
  }

  async run(delay = 1000) {
    let transactions = await this.getTransactions();
    if (transactions.length > 0) {
      await this.indexTransactions(transactions);
      this.run();
    } else {
      console.log(`No downloaded transactions found, waiting ${delay}ms`);
      this.timer = setTimeout(() => this.run(Math.floor(delay * 1.25)), delay);
    }
  }

  async indexTransactions(transactions) {
    // TODO: Integrate index function
  }

  async index() {
    const response = await this.db.pg
      .from("blocks")
      .whereIn("number", this.blockRange);

    if (response.length !== this.total)
      throw "Couldn't find all the blocks in the pg";

    const toIndex = response.map(object => {
      return object.data;
    });

    const result = await this.db.elasticsearch.bulkIndex(
      "blocks",
      "block",
      toIndex
    );

    this.totalIndexed = response.length;
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
}
