import upsert from "../util/upsert";
import withTimeout from "../util/withTimeout";

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

  async importBlock(blockNumber) {
    try {
      const block = await withTimeout(
        this.db.web3.getBlockByNumber(blockNumber, true),
        5000
      );
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
    } catch (err) {
      this.failedBlockNumbers.push(blockNumber);
      console.log(`Failed to import block ${blockNumber}`);
      return true;
    }
  }
}
