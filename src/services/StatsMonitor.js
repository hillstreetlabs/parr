import { action, computed, observable } from "mobx";
import withTimeout from "../util/withTimeout";
import inBatches from "../util/inBatches";

const BATCH_SIZE = 200;
const DELAY = 60000;

export default class StatsMonitor {
  constructor(db, options) {
    this.db = db;
    this.timer;
  }

  async run() {
    if (this.isExiting) return;
    await inBatches(
      this.db.pg("blocks"),
      blocks => this.processBlocks(blocks),
      BATCH_SIZE
    );
    console.log(`No blocks left to monitor, waiting ${DELAY / 1000}s`);
    this.timer = setTimeout(() => this.run(), DELAY);
  }

  async exit() {
    this.isExiting = true;
    console.log("Exiting...");
    clearTimeout(this.timer);
    process.exit();
  }

  async processBlocks(blocks) {
    const blockHashes = blocks.map(block => block.hash);
    const indexedByBlockHash = await this.indexedTransactionsByBlockHash(
      blockHashes
    );
    const statsJson = blocks.map(block => {
      return {
        hash: block.hash,
        number: block.number,
        id: block.id,
        transaction_count: block.data.transactionCount,
        indexed_count: indexedByBlockHash[block.hash] || 0
      };
    });
    await this.db.elasticsearch.bulkIndex("parr_monitoring", statsJson);
    console.log(`Updated monitoring for ${statsJson.length} blocks`);
    return true;
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
