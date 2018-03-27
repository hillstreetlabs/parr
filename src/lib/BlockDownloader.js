import Eth from "ethjs";
import { action, computed, observable } from "mobx";
import upsert from "../util/upsert";

const batchSize = 20;

export default class BlockImporter {
  constructor(db, options) {
    this.db = db;
    this.timer;
    this.pid = `downloader@${process.pid}`;
  }

  async run(delay = 1000) {
    let blockNumbers = await this.getBlocks();
    console.log("Blocks", blockNumbers);
    if (blockNumbers.length > 0) {
      await this.importBlocks(blockNumbers);
      this.run();
    } else {
      console.log(`No imported blocks found, waiting ${delay}ms`);
      this.timer = setTimeout(() => this.run(delay * 1.5), delay);
    }
  }

  async exit() {
    console.log("Exiting...");
    clearTimeout(this.timer);
    const unlocked = await this.db.pg
      .select()
      .from("blocks")
      .where({ locked_by: this.pid })
      .returning("number")
      .update({ locked_by: null, locked_at: null });
    console.log(`Unlocked ${unlocked.length} blocks`);
    process.exit();
  }

  getBlocks() {
    return this.db.pg.transaction(async trx => {
      const blocks = await trx
        .select()
        .from("blocks")
        .where({ status: "imported" })
        .returning("number")
        .limit(batchSize);
      const numbers = blocks.map(block => block.number);
      return trx
        .select()
        .from("blocks")
        .whereIn("number", numbers)
        .returning("number")
        .update({
          locked_by: this.pid,
          locked_at: this.db.pg.fn.now()
        });
    });
  }

  async importBlocks(blockNumbers) {
    await Promise.all(
      blockNumbers.map(block => {
        return this.importBlock(block);
      })
    );
  }

  async importBlock(blockNumber) {
    const block = await this.db.web3.getBlockByNumber(blockNumber, true);
    const savedBlock = await upsert(
      this.db.pg,
      "blocks",
      this.blockJson(block),
      "(number)"
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
    console.log(`Downloaded block ${blockNumber}`);
    return true;
  }

  decodeTimeField(field) {
    return new Date(field.mul(new Eth.BN(1000)).toNumber(10)).toISOString();
  }

  transactionJson(transaction) {
    return {
      hash: transaction.hash,
      status: "imported",
      data: {
        blockHash: transaction.blockHash,
        blockNumber: transaction.blockNumber.toNumber(),
        from: transaction.from,
        gas: transaction.gas.toString(10),
        gasPrice: Eth.fromWei(transaction.gasPrice, "ether"),
        nonce: transaction.nonce.toString(10),
        to: transaction.to,
        transactionIndex: transaction.transactionIndex.toString(10),
        value: Eth.fromWei(transaction.value, "ether"),
        logs: []
      }
    };
  }

  blockJson(block) {
    return {
      number: block.number.toNumber(),
      status: "downloaded",
      locked_by: null,
      locked_at: null,
      downloaded_by: this.pid,
      downloaded_at: this.db.pg.fn.now(),
      data: {
        difficulty: block.difficulty.toString(10),
        gasLimit: block.gasLimit.toString(10),
        gasUsed: block.gasUsed.toString(10),
        hash: block.hash,
        miner: block.miner,
        nonce: block.nonce.toString(10),
        parentHash: block.parentHash,
        size: block.size.toString(10),
        timestamp: this.decodeTimeField(block.timestamp)
      }
    };
  }
}
