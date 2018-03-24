import Eth from "ethjs";

export default class Parser {
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
}
