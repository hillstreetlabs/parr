import Eth from "ethjs";
import upsert from "../util/upsert";

export default class BlockImporter {
  constructor(db) {
    this.db = db;
  }

  async importBlocks(fromBlock, toBlock) {
    let currentBlock = fromBlock;
    while (currentBlock <= toBlock) {
      await this.importBlock(currentBlock);
      currentBlock += 1;
    }
  }

  async importBlock(blockNumber) {
    const block = await this.db.web3.getBlockByNumber(blockNumber, false);
    const blockJson = {
      number: block.number.toNumber(),
      hash: block.hash,
      status: "imported"
    };
    const saved = await upsert(this.db.pg, "blocks", blockJson, "(hash)");
    console.log(
      `Imported block: ${block.number.toString()}\tHash: ${block.hash}`
    );
    return saved;
  }
}
