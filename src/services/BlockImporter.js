import uuid from "uuid";
import Eth from "ethjs";
import { action, computed, observable } from "mobx";
import upsert from "../util/upsert";
import withTimeout from "../util/withTimeout";

const BATCH_SIZE = 20;
const DELAY = 5000;

export default class BlockImporter {
  constructor(db, options) {
    this.db = db;
    this.timer;
    this.pid = `BlockImporter@${uuid.v4()}`;
    this.currentBlockHashes = [];
  }

  async run() {
    if (this.isExiting) return;

    this.currentBlockHashes = await this.getBlockHashes();
    if (this.currentBlockHashes.length > 0) {
      await this.importBlocks();
      this.run();
    } else {
      console.log(`No blocks found to import, waiting ${DELAY}ms`);
      this.timer = setTimeout(() => this.run(), DELAY);
    }
  }

  async exit() {
    this.isExiting = true;

    console.log("Exiting...");
    clearTimeout(this.timer);
    if (this.currentBlockHashes.length > 0)
      await this.db.redis.saddAsync(
        "blocks:to_import",
        this.currentBlockHashes
      );
    console.log(`Unlocked ${this.currentBlockHashes.length} blocks`);
    process.exit();
  }

  getBlockHashes() {
    return this.db.redis.spopAsync("blocks:to_import", BATCH_SIZE);
  }

  async importBlocks() {
    await Promise.all(
      this.currentBlockHashes.map(blockHash => {
        return this.importBlock(blockHash);
      })
    );
  }

  async importBlock(blockHash) {
    try {
      const block = await withTimeout(
        this.db.web3.getBlockByHash(blockHash, true),
        5000
      );
      const savedBlock = await upsert(
        this.db.pg,
        "blocks",
        this.blockJson(block),
        "(hash)"
      );
      const transactionHashes = block.transactions.map(tx => tx.hash);
      if (transactionHashes.length > 0)
        await this.db.redis.saddAsync(
          "transactions:to_import",
          transactionHashes
        );
      await this.db.redis.saddAsync("blocks:to_index", blockHash);
      console.log(
        `Imported block: ${block.number.toString()}\tHash: ${
          blockHash
        }\tAdded ${transactionHashes.length} txns`
      );
      return true;
    } catch (err) {
      console.log(`Failed to import block ${blockHash}, un-locking...`);
      await this.unlockBlock(blockHash);
      return false;
    }
  }

  async unlockBlock(blockHash) {
    await this.db.redis.sadd("blocks:to_import", blockHash);
  }

  decodeTimeField(field) {
    return new Date(field.mul(new Eth.BN(1000)).toNumber(10)).toISOString();
  }

  blockJson(block) {
    return {
      number: block.number.toNumber(),
      hash: block.hash,
      data: {
        difficulty: block.difficulty.toString(10),
        gasLimit: block.gasLimit.toString(10),
        gasUsed: block.gasUsed.toString(10),
        miner: block.miner,
        nonce: block.nonce.toString(10),
        parentHash: block.parentHash,
        size: block.size.toString(10),
        timestamp: this.decodeTimeField(block.timestamp),
        transactionCount: (block.transactions || []).length
      }
    };
  }
}
