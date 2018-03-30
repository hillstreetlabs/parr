import upsert from "../util/upsert";

const BATCH_SIZE = 50;
const DELAY = 5000;

export default class BlockIndexer {
  constructor(db) {
    this.db = db;
    this.timer;
    this.pid = `BlockIndexer@${process.pid}`;
  }

  async run() {
    let blocks = await this.getBlocks();
    if (blocks.length > 0) {
      await this.indexBlocks(blocks);
      this.run();
    } else {
      console.log(`No ready blocks found, waiting ${DELAY}ms`);
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
      .update({
        locked_by: null,
        locked_at: null
      });
    console.log(`Unlocked ${unlocked.length} blocks`);
    process.exit();
  }

  getBlocks() {
    return this.db.pg.transaction(async trx => {
      const blocks = await trx
        .select()
        .from("blocks")
        .where({ status: "ready", locked_by: null })
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
      return blocks;
    });
  }

  async indexBlocks(blocks) {
    await Promise.all(
      blocks.map(async block => {
        await this.indexBlock(block);
      })
    );
  }

  async fetchBlockData(block) {
    const transactions = await this.db
      .pg("transactions")
      .where({ status: "indexed", block_hash: block.hash });

    const logs = await Promise.all(
      transactions.map(async transaction => {
        return await this.db
          .pg("logs")
          .where({ transaction_hash: transaction.hash });
      })
    );

    return { transactions, logs };
  }

  async indexBlock(block) {
    try {
      const { transactions, logs } = this.fetchBlockData(block);
      const parsedBlock = this.blockJson(block, transactions, logs);
      await this.db.elasticsearch.bulkIndex("blocks", "block", parsedBlock);
      await this.db
        .pg("blocks")
        .where({ hash: block.hash })
        .update({
          status: "indexed",
          locked_by: null,
          locked_at: null,
          indexed_by: this.pid,
          indexed_at: this.db.pg.fn.now()
        });

      console.log(`Indexed block ${block.hash}`);
    } catch (error) {
      console.log(`Failed to index block ${block.hash}`, error);
      return await this.unlockBlock(block.hash);
    }
  }

  async unlockBlock(hash) {
    const unlocked = await this.db
      .pg("blocks")
      .where("hash", hash)
      .returning("hash")
      .update({ locked_by: null, locked_at: null });
    return unlocked;
  }

  logJson(log, block) {
    return {
      block: {
        hash: block.data.hash,
        size: block.data.size,
        miner: block.data.miner,
        nonce: block.data.nonce,
        gas_used: block.data.gasUsed,
        gas_limit: block.data.gasLimit,
        timestamp: block.data.timestamp,
        difficulty: block.data.difficulty,
        parent_hash: block.data.parentHash
      },
      address: log.data.address,
      data: log.data.data,
      block_hash: log.data.blockHash,
      block_number: log.data.blockNumber,
      decoded: log.decoded,
      id: log.id,
      log_index: log.log_index,
      removed: log.data.removed,
      transaction_hash: log.transaction_hash,
      transaction_index: log.data.transactionIndex
    };
  }

  transactionJson(transaction, block, logs = []) {
    return {
      block: {
        hash: block.data.hash,
        size: block.data.size,
        miner: block.data.miner,
        nonce: block.data.nonce,
        gas_used: block.data.gasUsed,
        gas_limit: block.data.gasLimit,
        timestamp: block.data.timestamp,
        difficulty: block.data.difficulty,
        parent_hash: block.data.parentHash
      },
      block_hash: transaction.data.blockHash,
      block_number: transaction.data.blockNumber,
      contract_address: transaction.receipt.contractAddress,
      cumulative_gas_used: transaction.receipt.cumulativeGasUsed,
      from: transaction.data.from,
      gas: transaction.data.gas,
      gas_price: transaction.data.gasPrice,
      gas_used: transaction.receipt.gasUsed,
      hash: transaction.hash,
      id: transaction.id,
      logs_bloom: transaction.receipt.logsBloom,
      nonce: transaction.data.nonce,
      status: transaction.receipt.status,
      to: transaction.data.to,
      transaction_index: transaction.data.transactionIndex,
      value: transaction.data.value,
      logs: logs.map(log => {
        return this.logJson(log, block);
      })
    };
  }

  blockJson(block, transactions = [], logs = []) {
    return {
      difficulty: block.data.difficulty,
      gas_limit: block.data.gasLimit,
      gas_used: block.data.gasUsed,
      hash: block.data.hash,
      id: block.id,
      miner: block.data.miner,
      nonce: block.data.nonce,
      parent_Hash: block.data.parentHash,
      size: block.data.size,
      timestamp: block.data.timestamp,
      transaction_count: block.data.transactionCount,
      transactions: transactions.map((transaction, index) => {
        return this.transactionJson(transaction, block, logs[index]);
      })
    };
  }
}
