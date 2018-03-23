export default class Parser {
  decodeIntegerField(hex) {
    const result = hex.split("0x")[1];
    return parseInt(result, 16);
  }

  decodeTimeField(field) {
    const seconds = this.decodeIntegerField(field);
    let time = new Date();
    time.setSeconds(seconds);
    return time;
  }

  parseTransaction(transaction) {
    return {
      blockHash: transaction.blockHash,
      blockNumber: this.decodeIntegerField(transaction.blockNumber),
      from: transaction.from,
      gas: this.decodeIntegerField(transaction.gas),
      gasPrice: this.decodeIntegerField(transaction.gasPrice),
      hash: transaction.hash,
      to: transaction.to,
      transactionIndex: this.decodeIntegerField(transaction.transactionIndex),
      value: this.decodeIntegerField(transaction.value)
    };
  }

  parseBlock(block) {
    const result = block.result;
    return {
      difficulty: this.decodeIntegerField(result.difficulty),
      gasLimit: this.decodeIntegerField(result.gasLimit),
      gasUsed: this.decodeIntegerField(result.gasUsed),
      hash: result.hash,
      miner: result.miner,
      nonce: this.decodeIntegerField(result.nonce),
      number: this.decodeIntegerField(result.number),
      parentHash: result.parentHash,
      size: this.decodeIntegerField(result.size),
      timestamp: this.decodeTimeField(result.timestamp),
      transactions: result.transactions.map(transaction => {
        return this.parseTransaction(transaction);
      })
    };
  }
}
