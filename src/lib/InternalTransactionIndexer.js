// Index should have
// - address data
// - block data
// - internal transaction data
// -  transaction data

// [ { blockNumber: '5380549',
//        timeStamp: '1522866421',
//        from: '0x06012c8cf97bead5deae237070f9587f8e7a266d',
//        to: '0xc5f60fa4613493931b605b6da1e9febbdeb61e16',
//        value: '8000000000000000',
//        contractAddress: '',
//        input: '',
//        type: 'call',
//        gas: '2300',
//        gasUsed: '0',
//        isError: '0',
//        errCode: '' } ] }

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
    let blocks = await this.getInternalTransactions();
    if (blocks.length > 0) {
      await this.indexBlocks(blocks);
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
      .returning("hash")
      .update({
        locked_by: null,
        locked_at: null
      });
    console.log(`Unlocked ${unlocked.length} blocks`);
    process.exit();
  }

  getInternalTransactions() {
    return this.db.pg.transaction(async trx => {
      const blocks = await trx
        .select()
        .from("internal_transactions")
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

      throw "ASd";
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
