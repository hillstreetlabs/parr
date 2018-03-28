import upsert from "../util/upsert";

const BATCH_SIZE = 1;

export default class Indexer {
  constructor(db, options) {
    this.db = db;
    this.timer;
    this.pid = `Indexer@${process.pid}`;
  }

  async run(delay = 1000) {
    let transactions = await this.getTransactions();
    if (transactions.length > 0) {
      await this.indexTransactions(transactions);
      this.run();
    } else {
      console.log(`No downloaded transactions found, waiting ${delay}ms`);
      this.timer = setTimeout(() => this.run(Math.floor(delay * 1.25)), delay);
    }
  }

  async exit() {
    console.log("Exiting...");
    clearTimeout(this.timer);
    const unlocked = await this.db.pg
      .select()
      .from("transactions")
      .where({ locked_by: this.pid })
      .returning("hash")
      .update({
        locked_by: null,
        locked_at: null
      });
    console.log(`Unlocked ${unlocked.length} transactions`);
    process.exit();
  }

  getTransactions() {
    return this.db.pg.transaction(async trx => {
      const transactions = await trx
        .select()
        .from("transactions")
        .where({ status: "downloaded", locked_by: null })
        .limit(BATCH_SIZE);
      const hashes = await trx
        .select()
        .from("transactions")
        .whereIn("hash", transactions.map(transaction => transaction.hash))
        .returning("hash")
        .update({
          locked_by: this.pid,
          locked_at: this.db.pg.fn.now()
        });
      return transactions;
    });
  }

  async indexTransactions(transactions) {
    await Promise.all(
      transactions.map(async transaction => {
        await this.indexTransaction(transaction);

        const block = await this.db
          .pg("blocks")
          .where({ number: transaction.data.blockNumber })
          .first();

        const transactions = await this.db
          .pg("transactions")
          .where({ status: "indexed", block_hash: block.data.hash });

        if (block.data.transactionCount === transactions.length) {
          await this.indexBlock(block, transactions);
        }
      })
    );
  }

  async indexBlock(block, transactions) {
    try {
      const logs = await Promise.all(
        transactions.map(async transaction => {
          return await this.db
            .pg("logs")
            .where({ transaction_hash: transaction.hash });
        })
      );

      const parsedBlock = this.blockJson(block, transactions, logs);

      await this.db.elasticsearch.bulkIndex("blocks", "block", [parsedBlock]);

      await this.db
        .pg("blocks")
        .where({ number: block.number })
        .update({
          status: "indexed",
          locked_by: null,
          locked_at: null,
          indexed_by: this.pid,
          indexed_at: this.db.pg.fn.now()
        });

      console.log(`Indexed block ${block.number}`);
    } catch (error) {
      console.log(`Failed to index block ${block.number}`, error);
    }
  }

  async indexTransaction(transaction) {
    try {
      // TODO: Should these be locked?
      const block = await this.db
        .pg("blocks")
        .where({ number: transaction.data.blockNumber })
        .first();

      const logs = await this.indexLogs(transaction);

      const parsedTransaction = this.transactionJson(transaction, block, logs);

      await this.db.elasticsearch.bulkIndex("transactions", "transaction", [
        parsedTransaction
      ]);

      await this.db
        .pg("transactions")
        .where({ hash: transaction.hash })
        .update({
          status: "indexed",
          locked_by: null,
          locked_at: null,
          indexed_by: this.pid,
          indexed_at: this.db.pg.fn.now()
        });
      console.log(`Indexed transaction ${transaction.hash}`);
    } catch (error) {
      console.log(`Failed to index transaction ${transaction.hash}`, error);
    }
  }

  async indexLogs(transaction) {
    const logs = await this.db
      .pg("logs")
      .where({ transaction_hash: transaction.hash });

    const parsedLogs = logs.map(log => {
      return this.logJson(log);
    });

    await this.db.elasticsearch.bulkIndex("logs", "log", parsedLogs);

    await this.db
      .pg("logs")
      .where({ transaction_hash: transaction.hash })
      .update({
        status: "indexed",
        indexed_by: this.pid,
        indexed_at: this.db.pg.fn.now()
      });

    parsedLogs.forEach(log => {
      console.log(`Indexed log ${log.transaction_hash}:${log.log_index}`);
    });

    return logs;
  }

  logJson(log) {
    return {
      address: log.data.address,
      data: log.data.data,
      block_hash: log.data.blockHash,
      block_number: log.data.blockNumber,
      decoded: log.decoded,
      log_index: log.log_index,
      removed: log.data.removed,
      transaction_hash: log.transaction_hash,
      transaction_index: log.data.transactionIndex
    };
  }

  transactionJson(transaction, block, logs = []) {
    const blockData =
      block.data !== undefined
        ? {
            hash: block.data.hash,
            size: block.data.size,
            miner: block.data.miner,
            nonce: block.data.nonce,
            gas_used: block.data.gasUsed,
            gas_limit: block.data.gasLimit,
            timestamp: block.data.timestamp,
            difficulty: block.data.difficulty,
            parent_hash: block.data.parentHash
          }
        : {};

    return {
      block: blockData,
      block_hash: transaction.data.blockHash,
      block_number: transaction.data.blockNumber,
      contract_address: transaction.receipt.contractAddress,
      cumulative_gas_used: transaction.receipt.cumulativeGasUsed,
      from: transaction.data.from,
      gas: transaction.data.gas,
      gas_price: transaction.data.gasPrice,
      gas_used: transaction.receipt.gasUsed,
      hash: transaction.hash,
      logs_bloom: transaction.receipt.logsBloom,
      nonce: transaction.data.nonce,
      status: transaction.receipt.status,
      to: transaction.data.to,
      transaction_index: transaction.data.transactionIndex,
      value: transaction.data.value,
      logs: logs.map(log => {
        return this.logJson(log);
      })
    };
  }

  blockJson(block, transactions = [], logs = []) {
    return {
      difficulty: block.data.difficulty,
      gas_limit: block.data.gasLimit,
      gas_used: block.data.gasUsed,
      hash: block.data.hash,
      miner: block.data.miner,
      nonce: block.data.nonce,
      parent_Hash: block.data.parentHash,
      size: block.data.size,
      timestamp: block.data.timestamp,
      transaction_count: block.data.transactionCount,
      transactions: transactions.map((transaction, index) => {
        return this.transactionJson(transaction, {}, logs[index]);
      })
    };
  }
}
