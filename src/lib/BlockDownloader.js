import Eth from "ethjs";
import { action, computed, observable } from "mobx";
import upsert from "../util/upsert";

export default class BlockImporter {
  constructor(db, options) {
    this.db = db;
  }

  async run(delay = 1000) {
    let block = await this.getBlock();
    if (block) {
      await this.importBlock(block.number);
      console.log(`Downloaded block ${block.number}`);
      this.run();
    } else {
      console.log(`No block found, waiting ${delay}ms`);
      setTimeout(() => this.run(delay * 2), delay);
    }
  }

  async getBlock() {
    const blocks = await this.db.pg
      .select()
      .from("blocks")
      .where({ status: "imported" })
      .limit(1);
    return blocks[0];
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
