import Eth from "ethjs";
import { action, computed, observable } from "mobx";
import upsert from "../util/upsert";

export default class BlockImporter {
  constructor(db) {
    this.db = db;
  }

  async watch() {
    let current = (await this.db.web3.blockNumber()).toNumber();
    console.log(`Started watch from block ${current}`);
    this.importBlock(current);
    setInterval(async () => {
      const latest = (await this.db.web3.blockNumber()).toNumber();
      while (latest > current) {
        current += 1;
        this.importBlock(current);
      }
    }, 5000);
  }

  async importBlocks(fromBlock, toBlock) {
    let currentBlock = fromBlock;
    while (currentBlock <= toBlock) {
      await this.saveBlock(currentBlock);
      console.log(`Imported block ${currentBlock}`);
      currentBlock += 1;
    }
  }

  async importBlock(block) {
    await this.saveBlock(block);
    console.log(`Imported block ${block}`);
  }

  saveBlock(number) {
    const blockJson = {
      number: parseInt(number),
      status: "imported"
    };
    return upsert(this.db.pg, "blocks", blockJson, "(number)");
  }
}
