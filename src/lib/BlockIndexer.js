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
    let blocks = await this.getBlocks();
    if (blocks.length > 0) {
      await this.indexBlocks(blocks);
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

  getBlocks() {
    return this.db.pg.transaction(async trx => {
      const blocks = await trx
        .select()
        .from("blocks")
        .where({ status: "downloaded", locked_by: null })
        .limit(BATCH_SIZE);
      const hashes = await trx
        .select()
        .from("blocks")
        .whereIn("hash", blocks.map(block => block.hash))
        .returning("hash")
        .update({
          locked_by: this.pid,
          locked_at: this.db.pg.fn.now()
        });
      return blocks;
    });
  }

  async indexBlocks(blocks) {
    try {
      const blocksJson = blocks.map(block => blockJson(block));
      const indexed = await this.db.elasticsearch.bulkIndex(
        "parr_blocks_transactions",
        blocksJson
      );
      if (indexed.errors) throw "Failed to index blocks";
      const updated = await this.db
        .pg("blocks")
        .whereIn("hash", blocks.map(block => block.hash))
        .returning("number")
        .update({
          status: "indexed",
          locked_by: null,
          locked_at: null,
          indexed_by: this.pid,
          indexed_at: this.db.pg.fn.now()
        });
      console.log(`Indexed ${updated.length} blocks: ${updated.join(", ")}`);
      return true;
    } catch (err) {
      console.log(`Failed to index blocks`, err);
      return this.unlockBlocks();
    }
  }

  async unlockBlocks() {
    const unlocked = await this.db.pg
      .select()
      .from("blocks")
      .where({ locked_by: this.pid })
      .returning("hash")
      .update({
        locked_by: null,
        locked_at: null
      });
    console.log(`Unlocked ${unlocked.length} blocks`);
  }
}
