import Eth from "ethjs";
import { action, computed, observable } from "mobx";
import upsert from "knex-upsert";
import { Block } from "../models";

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
      this.runBatch(fromBlock, toBlock);
      fromBlock = toBlock + 1;
      toBlock = Math.min(fromBlock + 49, this.toBlock);
    }
  }

  async runBatch(from, to) {
    let batchPromises = [];
    for (let blockNumber = from; blockNumber <= to; blockNumber++) {
      batchPromises.push(this.importBlock(blockNumber));
    }
    return await Promise.all(batchPromises);
  }

  // Download block
  // Save to pg
  // Update totalImported
  async importBlock(blockNumber) {
    return new Promise(async (resolve, reject) => {
      try {
        console.log("Start importBlock", blockNumber);
        // Download blocks
        const block = await this.db.web3.getBlockByNumber(blockNumber, true);
        // Persist to pg
        // const saved = this.db.pg
        //   .insert(this.blockJson(block))
        //   .into("blocks")
        //   .then(res => {
        //     console.log("Done!", res);
        //   });
        const saved = upsert({
          db: this.db.pg,
          table: "blocks",
          object: this.blockJson(block),
          key: "number"
        });
        console.log("saved", saved);
        resolve(saved);
      } catch (err) {
        //console.log("importBlock Error", err);
        throw err;
        reject(err);
      }
    });
  }

  importBlockOld(blockNumber) {
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
      const receipt = await upsert({
        db: this.db.pg,
        table: "blocks",
        object: {
          number: parseInt(parsedBlock.number),
          status: "downloaded",
          data: parsedBlock
        },
        key: "number"
      });
      console.log("Import", receipt);
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
        nonce: block.nonce,
        parentHash: block.parentHash,
        size: block.size.toString(10),
        timestamp: this.decodeTimeField(block.timestamp)
      }
    };
  }
}
