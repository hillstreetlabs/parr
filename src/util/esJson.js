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
    contractAddress: transaction.receipt.contractAddress,
    cumulativeGasUsed: parseInt(transaction.receipt.cumulativeGasUsed),
    from: transaction.data.from,
    gas: parseInt(transaction.data.gas),
    gasPrice: parseFloat(transaction.data.gasPrice),
    gasUsed: parseInt(transaction.receipt.gasUsed),
    hash: transaction.hash,
    id: transaction.id,
    internalTransactions: (transaction.internalTransactions || []).map(
      internalTransaction => internalTransactionJson(internalTransaction)
    ),
    logs: (transaction.logs || []).map(log => logJson(log)),
    nonce: transaction.data.nonce,
    status: transaction.receipt.status,
    to: transaction.data.to,
    transactionIndex: parseInt(transaction.data.transactionIndex),
    value: parseFloat(transaction.data.value)
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
    from: internalTransaction.from_address,
    to: internalTransaction.to_address,
    block: internalTransaction.block
      ? blockJson(internalTransaction.block)
      : {},
    transaction: internalTransaction.transaction
      ? transactionJson(internalTransaction.transaction)
      : {},
    timestamp: internalTransaction.data.timestamp,
    value: internalTransaction.data.value,
    contractAddress: internalTransaction.data.contractAddress,
    input: internalTransaction.data.input,
    id: internalTransaction.id,
    type: internalTransaction.data.type,
    gas: internalTransaction.data.gas,
    gasUsed: internalTransaction.data.gasUsed,
    isError: internalTransaction.data.isError,
    errCode: internalTransaction.data.errCode,
    blockNumber: internalTransaction.data.blockNumber
  };
};
