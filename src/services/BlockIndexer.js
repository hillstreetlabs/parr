import uuid from "uuid";
import { blockJson } from "../util/esJson";

const BATCH_SIZE = 50;
const DELAY = 5000;

export default class BlockIndexer {
  constructor(db) {
    this.db = db;
    this.timer;
    this.pid = `BlockIndexer@${uuid.v4()}`;
  }

  async run() {
    this.blocks = await this.getBlocks();
    if (this.blocks.length > 0) {
      await this.indexBlocks();
      this.run();
    } else {
      console.log(`No indexable blocks found, waiting ${DELAY}ms`);
      this.timer = setTimeout(() => this.run(), DELAY);
    }
  }

  async exit() {
    console.log("Exiting...");
    clearTimeout(this.timer);
    await this.unlockBlocks();
    process.exit();
  }

  async unlockBlocks() {
    if (this.blocks.length > 0)
      await this.db.redis.saddAsync(
        "blocks:to_index",
        this.blocks.map(tx => tx.hash)
      );
    console.log(`Unlocked ${this.blocks.length} blocks`);
  }

  async getBlocks() {
    const blockHashes = await this.db.redis.spopAsync(
      "blocks:to_index",
      BATCH_SIZE
    );
    return this.db.pg.from("blocks").whereIn("hash", blockHashes);
  }

  async indexBlocks() {
    try {
      const blocksJson = this.blocks.map(block => blockJson(block));
      const indexed = await this.db.elasticsearch.bulkIndex(
        "parr_blocks_transactions",
        blocksJson
      );
      if (indexed.errors) throw new Error(JSON.stringify(indexed));
      console.log(`Indexed ${this.blocks.length} blocks`);
      return true;
    } catch (err) {
      console.log(`Failed to index blocks`, err);
      return this.unlockBlocks();
    }
  }
}
