import Eth from "ethjs";
import { action, computed, when, observable } from "mobx";
import upsert from "../util/upsert";

class Block {
  @observable children = [];

  constructor(history, data) {
    this.history = history;
    this.number = data.number.toNumber();
    this.hash = data.hash;
    this.parentHash = data.parentHash;
    when(() => this.isReadyToImport, () => this.history.importBlock(this.hash));
    when(() => this.isStale, () => this.history.flushBlock(this.hash));
  }

  @computed
  get isReadyToImport() {
    return this.depth >= 6;
  }

  @computed
  get isStale() {
    const diff = this.history.lastNumber - this.number;
    return diff >= 10; // Arbitrary
  }

  get parent() {
    return this.history.blocks[this.parentHash];
  }

  @action
  addChild(block) {
    this.children = [...this.children, block];
  }

  @computed
  get depth() {
    if (this.children.length > 0)
      return 1 + Math.max(...this.children.map(child => child.depth));
    return 0;
  }

  toString() {
    return `Number: ${this.number}\tHash: ${this.hash.substring(
      0,
      8
    )}\tDepth: ${this.depth}\tChildren: ${this.children.length}\tReady: ${
      this.isReadyToImport
    }\tStale: ${this.isStale}`;
  }
}

class BlockHistory {
  @observable blocks = {};
  @observable lastNumber = 0;

  constructor(newBlockCallback) {
    this.newBlockCallback = newBlockCallback;
  }

  @action
  importBlock(hash) {
    this.newBlockCallback(this.blocks[hash]);
    this.flushBlock(hash);
  }

  @action
  flushBlock(hash) {
    console.log("Flush block", hash);
    delete this.blocks[hash];
  }

  @action
  addBlock(block) {
    if (!this.blocks[block.hash]) {
      const newBlock = new Block(this, block);
      this.blocks[block.hash] = newBlock;
      if (newBlock.parent) newBlock.parent.addChild(newBlock);
    }
    const blockNumber = block.number.toNumber();
    if (blockNumber > this.lastNumber) {
      this.lastNumber = blockNumber;
    }
  }

  print() {
    console.log("Last number", this.lastNumber, Date.now());
    Object.keys(this.blocks).forEach(key => {
      let value = this.blocks[key];
      console.log("Block", value.toString());
    });
  }
}

export default class BlockWatcher {
  constructor(db) {
    this.db = db;
  }

  async run() {
    const history = new BlockHistory(block => this.saveBlock(block));
    history.print();
    setInterval(async () => {
      const latest = await this.db.web3.getBlockByNumber("latest", true);
      history.addBlock(latest);
      history.print();
    }, 1000);
  }

  async saveBlock(block) {
    const blockJson = {
      number: block.number,
      hash: block.hash,
      status: "imported"
    };
    await upsert(this.db.pg, "blocks", blockJson, "(hash)");
    console.log(`Imported block: ${block.number}\tHash: ${block.hash}`);
  }
}
