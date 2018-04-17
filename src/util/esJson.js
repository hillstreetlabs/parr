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

export const addressJson = address => {
  return {
    type: "address",
    join_field: "address",
    address: address.address,
    data: address.data,
    is_contract: address.bytecode != "0x",
    bytecode: address.bytecode,
    implements: address.implements || {},
    abi: address.abi,
    id: `address:${address.address}`
  };
};

export const transactionJson = transaction => {
  const type = transaction.type || "transaction";
  return {
    type: type,
    routing: transaction.routing,
    join_field: transaction.join_field,
    contract_address: transaction.receipt.contractAddress,
    cumulative_gas_used: parseInt(transaction.receipt.cumulativeGasUsed),
    from: transaction.from
      ? addressJson(transaction.from)
      : { address: transaction.from_address },
    gas: parseInt(transaction.data.gas),
    gas_price: parseFloat(transaction.data.gasPrice),
    gas_used: parseInt(transaction.receipt.gasUsed),
    hash: transaction.hash,
    id: `${type}:${transaction.hash}`,
    internal_transactions: (transaction.internalTransactions || []).map(
      internalTransaction => internalTransactionJson(internalTransaction)
    ),
    logs: (transaction.logs || []).map(log => logJson(log)),
    nonce: transaction.data.nonce,
    status: transaction.receipt.status,
    to: transaction.to
      ? addressJson(transaction.to)
      : { address: transaction.to_address },
    transaction_index: parseInt(transaction.data.transactionIndex),
    value: parseFloat(transaction.data.value)
  };
};

export const blockJson = block => {
  return {
    type: "block",
    join_field: "block",
    number: block.number,
    difficulty: block.data.difficulty,
    gas_limit: block.data.gasLimit,
    gas_used: block.data.gasUsed,
    hash: block.hash,
    id: `block:${block.hash}`,
    miner: block.data.miner,
    nonce: block.data.nonce,
    parent_hash: block.data.parentHash,
    size: block.data.size,
    timestamp: block.data.timestamp,
    transaction_count: block.data.transactionCount
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
