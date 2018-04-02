import { blockJson } from "../util/esJson";

const BATCH_SIZE = 50;
const DELAY = 5000;

export default class BlockIndexer {
  constructor(db) {
    this.db = db;
    this.timer;
    this.pid = `BlockIndexer@${process.pid}`;
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
    process.exit();
  }

  getBlocks() {
    return this.db.pg.transaction(async trx => {
      const blocks = await trx
        .select()
        .from("blocks")
        .where({ status: "indexable", locked_by: null })
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
    await Promise.all(blocks.map(block => this.indexBlock(block)));
  }

  async fetchBlockData(block) {
    block.transactions = await this.db
      .pg("transactions")
      .where({ status: "indexed", block_hash: block.hash });
    block.logs = this.db.pg("logs").where({ block_hash: block.hash });

    return block;
  }

  async indexBlock(block) {
    try {
      await this.db.elasticsearch.bulkIndex(
        "blocks",
        "block",
        blockJson(await this.fetchBlockData(block))
      );
      await this.db
        .pg("blocks")
        .where({ hash: block.hash })
        .update({
          status: "indexed",
          locked_by: null,
          locked_at: null,
          indexed_by: this.pid,
          indexed_at: this.db.pg.fn.now()
        });

      console.log(`Indexed block ${block.hash}`);
    } catch (error) {
      console.log(`Failed to index block ${block.hash}`, error);
      return await this.unlockBlock(block.hash);
    }
  }

  async unlockBlock(hash) {
    const unlocked = await this.db
      .pg("blocks")
      .where("hash", hash)
      .returning("hash")
      .update({ locked_by: null, locked_at: null });
    return unlocked;
  }
}
