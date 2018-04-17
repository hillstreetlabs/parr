export const logJson = log => {
  return {
    address: log.data.address,
    block: log.block ? blockJson(log.block) : {},
    data: log.data.data,
    block_hash: log.data.blockHash,
    block_number: log.data.blockNumber,
    decoded: log.decoded,
    id: log.id,
    log_index: log.log_index,
    removed: log.data.removed,
    transaction_hash: log.transaction_hash,
    transaction_index: log.data.transactionIndex
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
  const timestamp = transaction.block
    ? transaction.block.data.timestamp
    : transaction.timestamp;
  return {
    type,
    timestamp,
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
      internalTransaction => {
        return internalTransactionJson(
          Object.assign(internalTransaction, { timestamp })
        );
      }
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
    hash: block.data.hash,
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
    timestamp: internalTransaction.data.timestamp,
    value: internalTransaction.data.value,
    contract_address: internalTransaction.data.contractAddress,
    input: internalTransaction.data.input,
    id: internalTransaction.id,
    type: internalTransaction.data.type,
    gas: internalTransaction.data.gas,
    gas_used: internalTransaction.data.gasUsed,
    is_error: internalTransaction.data.isError,
    err_code: internalTransaction.data.errCode,
    block_number: internalTransaction.data.blockNumber
  };
};
