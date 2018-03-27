import Eth from "ethjs";
import upsert from "../util/upsert";
import { Ethmoji } from "ethmoji-contracts";

const ADDRESS_TO_ABI = {
  "0xa6d954d08877f8ce1224f6bfb83484c7d3abf8e9": Ethmoji.abi
};

export default class TransactionDownloader {
  constructor(db) {
    this.db = db;
  }

  async run() {
    const test = "0xa6d954d08877f8ce1224f6bfb83484c7d3abf8e9" in ADDRESS_TO_ABI;
    console.log("HEY", test);
    return;
    let transaction = await this.getTransaction();
    while (transaction) {
      await this.importTransaction(transaction);
      console.log(`Downloaded transaction ${transaction.hash}`);
      transaction = await this.getTransaction();
    }
    return true;
  }

  async getTransaction() {
    const transaction = await this.db
      .pg("transactions")
      .where({ status: "imported" })
      .first();

    await this.db
      .pg("transactions")
      .where("id", transaction.id)
      .update({ status: "locked" });

    return transaction;
  }

  async importTransaction(transaction) {
    const receipt = await eth.getTransactionReceipt(transaction.hash);

    let decoded;

    if (transaction.to in ADDRESS_TO_ABI) {
      try {
        const decoder = Eth.abi.logDecoder(ADDRESS_TO_ABI[transaction.to]);
        decoded = decoder(receipt.logs);
      } catch (error) {
        decoded = [];
      }
    } else {
      decoded = [];
    }

    const logs = receipt.logs.map((log, index) => {
      return this.parseLog(log, decoded[index]);
    });

    const savedTransaction = await upsert(
      this.db.pg,
      "transactions",
      this.blockJson(transaction, receipt, logs),
      "(hash)"
    );

    return true;
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

  transactionJson(transaction, receipt, logs = []) {
    const { data } = transaction;

    return {
      hash: transaction.hash,
      status: "downloaded",
      data: {
        blockHash: data.blockHash,
        blockNumber: data.blockNumber.toNumber(),
        cumulativeGasUsed: receipt.cumulativeGasUsed.toString(10),
        from: data.from,
        gas: data.gas.toString(10),
        gasPrice: Eth.fromWei(data.gasPrice, "ether"),
        gasUsed: receipt.gasUsed.toString(10),
        nonce: data.nonce.toString(10),
        to: data.to,
        transactionIndex: data.transactionIndex.toString(10),
        value: Eth.fromWei(data.value, "ether"),
        logs: logs || []
      }
    };
  }
}
