import uuid from "uuid";
import omit from "lodash/omit";
import uniq from "lodash/uniq";
import flatten from "lodash/flatten";
import { logJson, transactionJson } from "../util/esJson";
import createTimer from "../util/createTimer";
import { observable, autorun } from "mobx";
import { Line, LineBuffer, Clear } from "clui";

const BATCH_SIZE = 200;
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
    this.transactions = await this.getTransactions();
    if (this.transactions.length > 0) {
      await this.indexTransactions();
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
    if (this.transactions.length > 0)
      await this.db.redis.saddAsync(
        "transactions:to_index",
        this.transactions.map(tx => tx.hash)
      );
    console.log(`Unlocked ${this.transactions.length} transactions`);
  }

  async getTransactions() {
    const transactionHashes = await this.db.redis.spopAsync(
      "transactions:to_index",
      BATCH_SIZE
    );
    return this.db.pg.from("transactions").whereIn("hash", transactionHashes);
  }

  async indexTransactions() {
    try {
      let timer = this.timer.time("fetching");
      await this.fetchTransactionData();
      timer.stop();
      timer = this.timer.time("indexing");
      await this.indexAsTransactions();
      await this.indexAsFromTransactions();
      await this.indexAsToTransactions();
      timer.stop();
      this.indexedTransactions += this.transactions.length;
    } catch (err) {
      console.log(`Failed to index transactions`, err);
      return this.unlockTransactions();
    }
  }

  async indexAsTransactions() {
    const transactionsJson = this.transactions.map(transaction => {
      transaction.type = "transaction";
      transaction.join_field = {
        name: "transaction",
        parent: `block:${transaction.block_hash}`
      };
      transaction.routing = `block:${transaction.block_hash}`;
      return transactionJson(transaction);
    });

    const indexed = await this.db.elasticsearch.bulkIndex(
      "parr_blocks_transactions",
      transactionsJson
    );
    if (indexed.errors) throw JSON.stringify(indexed);
    return indexed;
  }

  async indexAsFromTransactions() {
    const transactionsJson = this.transactions.map(transaction => {
      transaction.type = "from_transaction";
      transaction.join_field = {
        name: "from_transaction",
        parent: `address:${transaction.from_address}`
      };
      transaction.routing = `address:${transaction.from_address}`;
      return transactionJson(transaction);
    });
    const indexed = await this.db.elasticsearch.bulkIndex(
      "parr_addresses",
      transactionsJson
    );
    if (indexed.errors) throw JSON.stringify(indexed);
    return indexed;
  }

  async indexAsToTransactions() {
    const transactionsJson = this.transactions.map(transaction => {
      transaction.type = "to_transaction";
      transaction.join_field = {
        name: "to_transaction",
        parent: `address:${transaction.to_address}`
      };
      transaction.routing = `address:${transaction.to_address}`;
      return transactionJson(transaction);
    });
    const indexed = await this.db.elasticsearch.bulkIndex(
      "parr_addresses",
      transactionsJson
    );
    if (indexed.errors) throw JSON.stringify(indexed);
    return indexed;
  }

  // fetchTransactionData fetches addresses, blocks, and logs for each of
  // this.transactions
  async fetchTransactionData() {
    // Fetch all addresses
    const addressHashes = uniq(
      flatten(this.transactions.map(t => [t.from_address, t.to_address]))
    );
    const addresses = await this.db
      .pg("addresses")
      .whereIn("address", addressHashes);
    const addressesByHash = addresses.reduce((byHash, a) => {
      byHash[a.address] = a;
      return byHash;
    }, {});

    // Fetch all blocks
    const blockHashes = uniq(this.transactions.map(t => t.block_hash));
    const blocks = await this.db.pg("blocks").whereIn("hash", blockHashes);
    const blocksByHash = blocks.reduce((byHash, b) => {
      byHash[b.hash] = b;
      return byHash;
    }, {});

    // Fetch all logs
    const transactionHashes = this.transactions.map(t => t.hash);
    const logs = await this.db
      .pg("logs")
      .whereIn("transaction_hash", transactionHashes);
    const logsByTransactionHash = logs.reduce((byHash, l) => {
      if (!byHash[l.transaction_hash]) byHash[l.transaction_hash] = [];
      byHash[l.transaction_hash].push(l);
      return byHash;
    }, {});

    // Fetch all internal transactions
    const internalTransactions = await this.db
      .pg("internal_transactions")
      .whereIn("transaction_hash", transactionHashes);
    const internalTransactionsByTransactionHash = internalTransactions.reduce(
      (byHash, internalTxn) => {
        if (!byHash[internalTxn.transaction_hash])
          byHash[internalTxn.transaction_hash] = [];
        byHash[internalTxn.transaction_hash].push(internalTxn);
        return byHash;
      },
      {}
    );

    this.transactions.forEach(tx => {
      tx.from = addressesByHash[tx.from_address];
      tx.to = addressesByHash[tx.to_address];
      tx.block = blocksByHash[tx.block_hash];
      tx.logs = logsByTransactionHash[tx.hash];
      tx.internalTransactions = internalTransactionsByTransactionHash[tx.hash];
    });
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
    statHeaders.fill().store();
    statValues.fill().store();
    new Line(outputBuffer)
      .column("Transactions", 20)
      .fill()
      .store();
    new Line(outputBuffer)
      .column(`${this.indexedTransactions}`, 20)
      .fill()
      .store();
    outputBuffer.output();
  }
}
