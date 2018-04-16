import upsert from "../util/upsert";
import withTimeout from "../util/withTimeout";

const BATCH_SIZE = 30;
const MAX_FAILURE_ATTEMPTS = 10;

export default class BlockAdder {
  constructor(db) {
    this.db = db;
    this.failedBlockNumbers = []; // Record of blocks that failed to import
  }

  async run(fromBlock, toBlock) {
    let batchStartBlock = fromBlock;
    let batchEndBlock = Math.min(batchStartBlock + BATCH_SIZE - 1, toBlock);
    while (batchStartBlock <= toBlock) {
      let promises = [];
      for (let num = batchStartBlock; num <= batchEndBlock; num += 1) {
        promises.push(this.importBlock(num));
      }
      await Promise.all(promises);
      batchStartBlock = batchEndBlock + 1;
      batchEndBlock = Math.min(batchStartBlock + BATCH_SIZE - 1, toBlock);
    }
    await this.handleFailedBlocks();
    return true;
  }

  async handleFailedBlocks(attemptCount = 0) {
    if (attemptCount >= MAX_FAILURE_ATTEMPTS) return false;
    if (this.failedBlockNumbers.length <= 0) return false;
    console.log(
      `Failure attempt ${attemptCount + 1} of ${MAX_FAILURE_ATTEMPTS}`
    );
    const blockNumbers = this.failedBlockNumbers;
    this.failedBlockNumbers = [];
    await Promise.all(blockNumbers.map(num => this.importBlock(num)));
    if (this.failedBlockNumbers.length > 0) {
      await this.handleFailedBlocks(attemptCount + 1);
    }
  }

  // Adds the block hash of a particular block to redis
  async importBlock(blockNumber) {
    try {
      const block = await withTimeout(
        this.db.web3.getBlockByNumber(blockNumber, true),
        5000
      );
      await this.db.redis.saddAsync("blocks:to_import", block.hash);
      console.log(
        `Added block: ${block.number.toString()}\tHash: ${block.hash}`
      );
    } catch (err) {
      this.failedBlockNumbers.push(blockNumber);
      console.log(`Failed to add block ${blockNumber}`, err);
    }
  }
}
