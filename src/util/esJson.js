export const logJson = log => {
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
};

export const transactionJson = transaction => {
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
};

export const blockJson = block => {
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
    transactions: (block.transactions || []).map(transaction =>
      transactionJson(transaction)
    )
  };
};

export const addressJson = address => {
  return {
    address: address.address,
    isContract: address.isContract,
    isERC20: address.is_erc20,
    isERC721: address.is_erc721,
    abi: address.abi,
    id: address.id,
    transactions: (address.transactions || []).map(transaction =>
      transactionJson(transaction)
    )
  };
};

export const internalTransactionJson = internalTransaction => {
  return {
    from: internalTransaction.fromAddress
      ? addressJson(internalTransaction.fromAddress)
      : {},
    to: internalTransaction.toAddress
      ? addressJson(internalTransaction.toAddress)
      : {},
    block: internalTransaction.block
      ? blockJson(internalTransaction.block)
      : {},
    transaction: internalTransaction.transaction
      ? transactionJson(internalTransaction.transaction)
      : {},
    timeStamp: internalTransaction.data.timeStamp,
    value: internalTransaction.data.value,
    contractAddress: internalTransaction.data.contractAddress,
    input: internalTransaction.data.input,
    type: internalTransaction.data.type,
    gas: internalTransaction.data.gas,
    gasUsed: internalTransaction.data.gasUsed,
    isError: internalTransaction.data.isError,
    errCode: internalTransaction.data.errCode
  };
};
