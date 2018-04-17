import { action, computed, observable } from "mobx";
import withTimeout from "../util/withTimeout";

const BATCH_SIZE = 200;
//const DELAY = 60000;
const DELAY = 1000;

export default class StatsMonitor {
  constructor(db, options) {
    this.db = db;
    this.timer;
    this.blocks = [];
    this.blockScrollId = 0;
  }

  async run() {
    if (this.isExiting) return;
    this.blocks = await this.getBlocks();
    if (this.blocks.length > 0) {
      await this.processBlocks();
      this.blockScrollId = this.blocks[this.blocks.length - 1].id;
      this.run();
    } else {
      this.blockScrollId = 0;
      console.log(`No blocks left to monitor, waiting ${DELAY / 1000}s`);
      this.timer = setTimeout(() => this.run(), DELAY);
    }
  }

  async exit() {
    this.isExiting = true;
    console.log("Exiting...");
    clearTimeout(this.timer);
    process.exit();
  }

  getBlocks() {
    return this.db
      .pg("blocks")
      .orderBy("id", "asc")
      .where("id", ">", this.blockScrollId)
      .limit(BATCH_SIZE);
  }

  async processBlocks() {
    const blockHashes = this.blocks.map(block => block.hash);
    const importedByBlockHash = await this.importedTransactionsByBlockHash(
      blockHashes
    );
    const indexedByBlockHash = await this.indexedTransactionsByBlockHash(
      blockHashes
    );
    const statsJson = this.blocks.map(block => {
      return {
        hash: block.hash,
        number: block.number,
        id: block.id,
        transaction_count: block.data.transactionCount,
        imported_count: importedByBlockHash[block.hash] || 0,
        indexed_count: indexedByBlockHash[block.hash] || 0
      };
    });
    await this.db.elasticsearch.bulkIndex("parr_monitoring", statsJson);
    console.log(`Updated monitoring for ${statsJson.length} blocks`);
    return true;
  }

  async importedTransactionsByBlockHash(blockHashes) {
    const importedMap = {};
    const importedRows = await this.db
      .pg("transactions")
      .whereIn("block_hash", blockHashes)
      .groupBy("block_hash")
      .select("block_hash")
      .count();
    importedRows.forEach(
      row => (importedMap[row.block_hash] = parseInt(row.count))
    );
    return importedMap;
  }

  async indexedTransactionsByBlockHash(blockHashes) {
    const indexedMap = {};
    const indexedQuery = await this.db.elasticsearch.client.search({
      index: "parr_blocks_transactions",
      size: blockHashes.length,
      body: {
        query: {
          bool: {
            must: {
              has_child: {
                type: "transaction",
                score_mode: "sum",
                query: { match_all: {} }
              }
            },
            filter: [
              { term: { type: "block" } },
              { terms: { hash: blockHashes } }
            ]
          }
        }
      }
    });
    indexedQuery.hits.hits.forEach(
      doc => (indexedMap[doc._source.hash] = doc._score)
    );
    return indexedMap;
  }
}
