export function logJson(log) {
  return {
    address: log.data.address,
    block: log.block ? blockJson(log.block) : {},
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
}

export function transactionJson(transaction) {
  return {
    block: transaction.block ? blockJson(transaction.block) : {},
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
    logs: (transaction.logs || []).map(log => logJson(log)),
    logsBloom: transaction.receipt.logsBloom,
    nonce: transaction.data.nonce,
    status: transaction.receipt.status,
    to: transaction.data.to,
    transactionIndex: transaction.data.transactionIndex,
    value: transaction.data.value
  };
}

export function blockJson(block) {
  return {
    difficulty: block.data.difficulty,
    gasLimit: block.data.gasLimit,
    gasUsed: block.data.gasUsed,
    hash: block.data.hash,
    id: block.id,
    logs: (block.logs || []).map(log => logJson(log)),
    miner: block.data.miner,
    nonce: block.data.nonce,
    parentHash: block.data.parentHash,
    size: block.data.size,
    timestamp: block.data.timestamp,
    transactionCount: block.data.transactionCount,
    transactions: (block.transactions || []).map(transaction => {
      return transactionJson(transaction);
    })
  };
}
