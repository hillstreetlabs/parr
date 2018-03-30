export function logJson(log, block, shallow = false) {
  const json = {
    address: log.data.address,
    data: log.data.data,
    blockHash: log.data.blockHash,
    blockNumber: log.data.blockNumber,
    decoded: log.decoded,
    id: log.id,
    logIndex: log.log_index,
    removed: log.data.removed,
    transactionHash: log.transaction_hash,
    transactionIndex: log.data.transactionIndex
  };

  return shallow
    ? json
    : Object.assign(json, {
        block: {
          hash: block.data.hash,
          size: block.data.size,
          miner: block.data.miner,
          nonce: block.data.nonce,
          gasUsed: block.data.gasUsed,
          gasLimit: block.data.gasLimit,
          timestamp: block.data.timestamp,
          difficulty: block.data.difficulty,
          parentHash: block.data.parentHash
        }
      });
}

export function transactionJson(transaction, block, logs, shallow) {
  const json = {
    blockHash: transaction.data.blockHash,
    blockNumber: transaction.data.blockNumber,
    contractAddress: transaction.receipt.contractAddress,
    cumulativeGasUsed: transaction.receipt.cumulativeGasUsed,
    from: transaction.data.from,
    gas: transaction.data.gas,
    gasPrice: transaction.data.gasPrice,
    gasUsed: transaction.receipt.gasUsed,
    hash: transaction.hash,
    id: transaction.id,
    logsBloom: transaction.receipt.logsBloom,
    nonce: transaction.data.nonce,
    status: transaction.receipt.status,
    to: transaction.data.to,
    transactionIndex: transaction.data.transactionIndex,
    value: transaction.data.value
  };

  return shallow
    ? json
    : Object.assign(json, {
        block: {
          hash: block.data.hash,
          size: block.data.size,
          miner: block.data.miner,
          nonce: block.data.nonce,
          gasUsed: block.data.gasUsed,
          gasLimit: block.data.gasLimit,
          timestamp: block.data.timestamp,
          difficulty: block.data.difficulty,
          parentHash: block.data.parentHash
        },
        logs: logs.map(log => logJson(log, block, true))
      });
}

export function blockJson(block, transactions, logs) {
  return {
    difficulty: block.data.difficulty,
    gasLimit: block.data.gasLimit,
    gasUsed: block.data.gasUsed,
    hash: block.data.hash,
    id: block.id,
    logs: logs.map(log => logJson(log, block, true)),
    miner: block.data.miner,
    nonce: block.data.nonce,
    parentHash: block.data.parentHash,
    size: block.data.size,
    timestamp: block.data.timestamp,
    transactionCount: block.data.transactionCount,
    transactions: transactions.map(transaction => {
      return transactionJson(transaction, block, [], true);
    })
  };
}
