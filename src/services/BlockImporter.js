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
  }

  async run() {
    let blockHashes = await this.getBlockHashes();
    if (blockHashes.length > 0) {
      await this.importBlocks(blockHashes);
      this.run();
    } else {
      console.log(`No blocks found to import, waiting ${DELAY}ms`);
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
      .update({ locked_by: null, locked_at: null });
    console.log(`Unlocked ${unlocked.length} blocks`);
    process.exit();
  }

  getBlockHashes() {
    return this.db.pg.transaction(async trx => {
      const blocks = await trx
        .select()
        .from("blocks")
        .where({ status: "imported", locked_by: null })
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
      return hashes;
    });
  }

  async importBlocks(blockHashes) {
    await Promise.all(
      blockHashes.map(blockHash => {
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
      const transactionsJson = block.transactions.map(tx =>
        this.transactionJson(tx)
      );
      let savedTransactions;
      try {
        savedTransactions = await this.db
          .pg("transactions")
          .insert(transactionsJson);
      } catch (err) {
        // Silence duplicate errors
      }
      console.log(
        `Imported block: ${block.number.toString()}\tHash: ${blockHash}`
      );
      return true;
    } catch (err) {
      console.log(`Failed to import block ${blockHash}, un-locking...`);
      return this.unlockBlock(blockHash);
    }
  }

  async unlockBlock(blockHash) {
    const unlocked = await this.db
      .pg("blocks")
      .where("hash", blockHash)
      .returning("hash")
      .update({ locked_by: null, locked_at: null });
    return unlocked;
  }

  decodeTimeField(field) {
    return new Date(field.mul(new Eth.BN(1000)).toNumber(10)).toISOString();
  }

  transactionJson(transaction) {
    return {
      hash: transaction.hash,
      block_hash: transaction.blockHash,
      status: "imported",
      from_address: transaction.from,
      to_address: transaction.to,
      data: {
        blockNumber: transaction.blockNumber.toNumber(),
        gas: transaction.gas.toString(10),
        gasPrice: Eth.fromWei(transaction.gasPrice, "ether"),
        nonce: transaction.nonce.toString(10),
        transactionIndex: transaction.transactionIndex.toNumber(),
        value: Eth.fromWei(transaction.value, "ether"),
        logs: []
      }
    };
  }

  blockJson(block) {
    return {
      number: block.number.toNumber(),
      hash: block.hash,
      status: "downloaded",
      locked_by: null,
      locked_at: null,
      downloaded_by: this.pid,
      downloaded_at: this.db.pg.fn.now(),
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
