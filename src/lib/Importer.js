import Eth from "ethjs";
import { action, computed, observable } from "mobx";

export default class Importer {
  @observable isRunning = false;
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

  @action
  async import() {
    this.isRunning = true;
    // Setup batch import
    const importBatch = async (from, to) => {
      let batchPromises = [];
      for (let i = from; i <= to; i++) {
        let promise = this.importBlock(i).then(
          action(block => {
            this.totalImported = this.totalImported + 1;
            return block;
          })
        );
        batchPromises.push(promise);
      }
      let imported = await Promise.all(batchPromises);
      // Add to pg
      let pgList = imported.map(data => {
        return { number: parseInt(data.number), status: "downloaded", data };
      });
      let response = await this.db.pg("blocks").insert(pgList);
      // Check if we've reached end of import
      if (to < this.toBlock) {
        importBatch(to + 1, Math.min(this.toBlock, to + 50));
      }
    };
    // Start import
    await importBatch(
      this.fromBlock,
      Math.min(this.fromBlock + 49, this.toBlock)
    );
    // Stop
    this.isRunning = false;
  }

  importBlock(blockNumber) {
    return new Promise(async (resolve, reject) => {
      const block = await this.db.web3.getBlockByNumber(blockNumber, true);
      const parsedBlock = this.parseBlock(block);
      parsedBlock.transactions = await Promise.all(
        parsedBlock.transactions.map(async txn => {
          const receipt = await this.db.web3.getTransactionReceipt(txn.hash);
          txn.cumulativeGasUsed = receipt.cumulativeGasUsed.toString(10);
          txn.gasUsed = receipt.gasUsed.toString(10);

          let decoded;
          try {
            decoded = decoder(receipt.logs);
          } catch (error) {
            decoded = [];
          }
          txn.logs = receipt.logs.map((log, index) => {
            return this.parseLog(log, decoded[index]);
          });
          return txn;
        })
      );
      resolve(parsedBlock);
    });
  }

  decodeIntegerField(hex) {
    const result = hex.split("0x")[1];
    return parseInt(result, 16);
  }

  decodeTimeField(field) {
    return new Date(field.mul(new Eth.BN(1000)).toNumber(10)).toISOString();
  }

  parseLog(log, decoded = {}) {
    return {
      address: log.address,
      data: log.data,
      blockHash: log.blockHash,
      blockNumber: log.blockNumber.toString(10),
      logIndex: log.logIndex.toString(10),
      removed: log.removed,
      transactionHash: log.transactionHash,
      transactionIndex: log.transactionIndex.toString(10),
      decoded: decoded || {}
    };
  }

  parseTransaction(transaction) {
    return {
      blockHash: transaction.blockHash,
      blockNumber: transaction.blockNumber.toString(10),
      from: transaction.from,
      gas: transaction.gas.toString(10),
      gasPrice: Eth.fromWei(transaction.gasPrice, "ether"),
      hash: transaction.hash,
      nonce: transaction.nonce.toString(10),
      to: transaction.to,
      transactionIndex: transaction.transactionIndex.toString(10),
      value: Eth.fromWei(transaction.value, "ether"),
      logs: []
    };
  }

  parseBlock(block) {
    return {
      difficulty: block.difficulty.toString(10),
      gasLimit: block.gasLimit.toString(10),
      gasUsed: block.gasUsed.toString(10),
      hash: block.hash,
      miner: block.miner,
      nonce: block.nonce.toString(10),
      number: block.number.toString(10),
      parentHash: block.parentHash,
      size: block.size.toString(10),
      timestamp: this.decodeTimeField(block.timestamp),
      transactions: block.transactions.map(transaction => {
        return this.parseTransaction(transaction);
      })
    };
  }
}
