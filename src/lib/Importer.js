import Eth from "ethjs";
import { action, computed, observable } from "mobx";
import upsert from "../util/upsert";

export default class Importer {
  @observable totalImported = 0;

  constructor(db, options) {
    this.db = db;
    if (options.last) {
      this.fromBlock = db.latestBlock - options.last + 1;
      this.toBlock = db.latestBlock;
    } else if (options.block) {
      this.fromBlock = this.toBlock = options.block;
    } else {
      this.fromBlock = options.from || 1;
      this.toBlock = options.to || db.latestBlock;
    }
    if (this.toBlock < this.fromBlock)
      throw "toBlock must be greater than or equal to fromBlock";
  }

  @computed
  get importedPerc() {
    if (this.total == 0) return 0;
    return this.totalImported / this.total;
  }

  get total() {
    return this.toBlock - this.fromBlock + 1;
  }

  async run() {
    // Start import
    let fromBlock = this.fromBlock;
    let toBlock = Math.min(this.fromBlock + 49, this.toBlock);
    while (fromBlock <= this.toBlock) {
      console.log(`Importing block ${fromBlock} to block ${toBlock}`);
      await this.runBatch(fromBlock, toBlock);
      fromBlock = toBlock + 1;
      toBlock = Math.min(fromBlock + 49, this.toBlock);
    }
  }

  async runBatch(from, to) {
    let batchPromises = [];
    for (let blockNumber = from; blockNumber <= to; blockNumber++) {
      batchPromises.push(this.importBlock(blockNumber));
    }
    await Promise.all(batchPromises);
  }

  async importBlock(blockNumber) {
    return new Promise(async (resolve, reject) => {
      try {
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
        resolve({ block, savedBlock, savedTransactions });
      } catch (err) {
        reject(err);
      }
    });
  }

  decodeTimeField(field) {
    return new Date(field.mul(new Eth.BN(1000)).toNumber(10)).toISOString();
  }

  transactionJson(transaction) {
    return {
      hash: transaction.hash,
      status: "downloaded",
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
