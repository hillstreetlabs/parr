import Eth from "ethjs";
import upsert from "../util/upsert";
import { Ethmoji } from "ethmoji-contracts";

const ADDRESS_TO_ABI = {
  "0xa6d954d08877f8ce1224f6bfb83484c7d3abf8e9": Ethmoji.abi
};

export default class TransactionImporter {
  constructor(db) {
    this.db = db;
  }

  async import() {
    const txn = await this.db
      .pg("transactions")
      .where({ status: "downloaded" })
      .first();

    await this.db
      .pg("transactions")
      .where("id", txn.id)
      .update({ status: "locked" }, "hash");

    try {
      await importTxn(txn);
    } catch (error) {
      // retry
    }
  }

  async importTxn(txn) {
    return new Promise(async (resolve, reject) => {
      const receipt = await eth.getTransactionReceipt(txnHash);
      txn.data.cumulativeGasUsed = receipt.cumulativeGasUsed.toString(10);
      txn.data.gasUsed = receipt.gasUsed.toString(10);

      console.log(txn);
      // let decoded;
      // try {
      //   const decoder = Eth.abi.logDecoder(ethmoji.abi);
      //   decoded = decoder(receipt.logs);
      // } catch (error) {
      //   decoded = [];
      // }
      // txn.logs = receipt.logs.map((log, index) => {
      //   return this.parseLog(log, decoded[index]);
      // });

      // Update pg data with txn.
    });
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
}
