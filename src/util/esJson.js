import Eth from "ethjs";
import BN from "bn.js";

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

export const weiJson = wei => {
  // Hack to deal with versioning
  // If wei is a number (as in transaction.value),
  // it is actually ether and we need to convert it
  if (Number(wei) === wei) {
    wei = Eth.toWei(wei, "ether");
  }
  const raw = wei.toString();
  return {
    wei: parseFloat(raw),
    eth: parseFloat(Eth.fromWei(raw, "ether")),
    raw
  };
};

export const tokenJson = token => {
  const { name, symbol } = token;
  return { name, symbol };
};

export const crowdsaleJson = crowdsale => {
  return {
    token: tokenJson(crowdsale.token),
    rate: weiJson(crowdsale.weiRate),
    raised: weiJson(crowdsale.weiRaised)
  };
};

export const addressJson = address => {
  const json = {
    type: "address",
    join_field: "address",
    address: address.address,
    is_contract: address.bytecode != "0x",
    bytecode: address.bytecode,
    implements: address.implements || {},
    abi: address.abi,
    id: `address:${address.address}`
  };
  if ((address.data || {}).token) {
    json.token = tokenJson(address.data.token);
  }
  if ((address.data || {}).crowdsale) {
    json.crowdsale = crowdsaleJson(address.data.crowdsale);
  }
  return json;
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
    internal_transactions: (transaction.internal_transactions || []).map(
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
    value: weiJson(transaction.data.value)
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
    block_hash: internalTransaction.block_hash,
    from: internalTransaction.from_address,
    gas: parseInt(internalTransaction.data.gas),
    gas_used: parseFloat(internalTransaction.data.gasUsed),
    id: internalTransaction.id,
    internal_transaction_index: internalTransaction.internal_transaction_index,
    timestamp: internalTransaction.timestamp,
    to: internalTransaction.to_address,
    type: internalTransaction.data.type,
    value: weiJson(internalTransaction.data.value)
  };
};
