import Eth from "ethjs";
import upsert from "../util/upsert";

const BATCH_SIZE = 30;
const MAX_FAILURE_ATTEMPTS = 10;

export default class BlockImporter {
  constructor(db) {
    this.db = db;
    this.failedBlockNumbers = []; // Record of blocks that failed to import
  }

  async importBlocks(fromBlock, toBlock) {
    let batchStartBlock = fromBlock;
    let batchEndBlock = Math.min(batchStartBlock + BATCH_SIZE - 1, toBlock);
    while (batchEndBlock <= toBlock) {
      let promises = [];
      for (let num = batchStartBlock; num <= batchEndBlock; num += 1) {
        promises.push(this.importBlock(num));
      }
      await Promise.all(promises);
      batchStartBlock = batchEndBlock + 1;
      batchEndBlock = Math.min(batchStartBlock + BATCH_SIZE - 1, toBlock);
    }
    let failureAttempts = 0;
    while (
      this.failedBlockNumbers.length > 0 &&
      failureAttempts <= MAX_FAILURE_ATTEMPTS
    ) {
      let blockNumbers = this.failedBlockNumbers;
      this.failedBlockNumbers = [];
      await Promise.all(blockNumbers.map(num => this.importBlock(num)));
      failureAttempts += 1;
    }
  }

  async importBlock(blockNumber) {
    try {
      const timer = setTimeout(() => {
        throw `importBlock ${blockNumber} timed out`;
      }, 5000);
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
      if (timer) clearTimeout(timer);
      return saved;
    } catch (err) {
      this.failedBlockNumbers.push(blockNumber);
      console.log(`Failed to import block ${blockNumber}`);
      return true;
    }
  }
}
