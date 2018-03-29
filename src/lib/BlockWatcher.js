import Eth from "ethjs";
import { action, computed, when, observable } from "mobx";
import upsert from "../util/upsert";

class Block {
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
    return this.history.blocks.get(this.parentHash);
  }

  @computed
  get children() {
    return this.history.blocks
      .values()
      .filter(block => block.parentHash == this.hash);
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
  //@observable blocks = new Map();
  @observable lastNumber = 0;

  constructor(props) {
    this.onNewBlock = props.onNewBlock;
    this.blocks = observable.map();
  }

  @action
  importBlock(hash) {
    this.onNewBlock(this.blocks.get(hash));
    this.flushBlock(hash);
  }

  @action
  flushBlock(hash) {
    console.log("Flush block", hash);
    this.blocks.delete(hash);
  }

  @action
  addBlock(block) {
    if (!this.blocks.has(block.hash))
      this.blocks.set(block.hash, new Block(this, block));
    const blockNumber = block.number.toNumber();
    if (blockNumber > this.lastNumber) {
      this.lastNumber = blockNumber;
    }
  }

  print() {
    console.log("Last number", this.lastNumber, Date.now());
    this.blocks.forEach((value, key) => {
      console.log("Block", value.toString());
    });
  }
}

export default class BlockWatcher {
  constructor(db) {
    this.db = db;
  }

  async run() {
    const history = new BlockHistory({
      onNewBlock: block => this.saveBlock(block)
    });
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
