import Eth from "ethjs";
import { action, computed, observable } from "mobx";

export default class Importer {
  @observable isRunning = false;
  @observable imported = [];

  constructor(db, options) {
    this.db = db;
    this.blockNumbers = options.block
      ? [options.block]
      : this.getBlockNumbers();
    console.log("Total", this.blockNumbers[0], this.blockNumbers.length);
  }

  @computed
  get importedPerc() {
    if (this.total == 0) return 0;
    return this.imported.length / this.total;
  }

  get total() {
    return this.blockNumbers.length;
  }

  @action
  async import() {
    this.isRunning = true;
    // Start
    await Promise.all(
      this.blockNumbers.map(blockNumber => {
        return this.importBlock(blockNumber).then(block => {
          this.imported.push(block);
        });
      })
    );
    await this.db.elasticsearch.bulkIndex("blocks", "block", this.imported);
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
      nonce: block.nonce,
      number: block.number.toString(10),
      parentHash: block.parentHash,
      size: block.size.toString(10),
      timestamp: this.decodeTimeField(block.timestamp),
      transactions: block.transactions.map(transaction => {
        return this.parseTransaction(transaction);
      })
    };
  }

  getBlockNumbers() {
    const blockNumbers = [];
    //const res = await this.db.web3.getBlockByNumber("latest", false);
    // TODODODODODOD
    const res = { number: 10000 };
    for (let i = 1; i <= res.number; i++) {
      blockNumbers.push(i);
    }
    return blockNumbers;
  }
}
