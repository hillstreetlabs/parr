import Eth from "ethjs";
import upsert from "../util/upsert";
import withTimeout from "../util/withTimeout";
import implementsAbi from "../util/implementsAbi";
import decodeTimeField from "../util/decodeTimeField";
import ERC20 from "../../contracts/ERC20.json";
import ERC721 from "../../contracts/ERC721.json";

const BATCH_SIZE = 50;
const DELAY = 5000;

export default class TransactionDownloader {
  constructor(db) {
    this.db = db;
    this.timer;
    this.pid = `TransactionDownloader@${process.pid}`;
  }

  async run() {
    let transactionHashes = await this.getTransactionHashes();
    if (transactionHashes.length > 0) {
      await this.importTransactions(transactionHashes);
      this.run();
    } else {
      console.log(`No imported transactions found, waiting ${DELAY}ms`);
      this.timer = setTimeout(() => this.run(), DELAY);
    }
  }

  async exit() {
    console.log("Exiting...");
    clearTimeout(this.timer);
    const unlocked = await this.db.pg
      .select()
      .from("transactions")
      .where({ locked_by: this.pid })
      .returning("hash")
      .update({
        locked_by: null,
        locked_at: null
      });
    console.log(`Unlocked ${unlocked.length} transactions`);
    process.exit();
  }

  getTransactionHashes() {
    return this.db.pg.transaction(async trx => {
      const transactions = await trx
        .select()
        .from("transactions")
        .where({ status: "imported", locked_by: null })
        .limit(BATCH_SIZE);
      const hashes = await trx
        .select()
        .from("transactions")
        .whereIn("hash", transactions.map(transaction => transaction.hash))
        .returning("hash")
        .update({
          locked_by: this.pid,
          locked_at: this.db.pg.fn.now()
        });
      return hashes;
    });
  }

  async importTransactions(transactionHashes) {
    await Promise.all(
      transactionHashes.map(hash => {
        return this.importTransaction(hash);
      })
    );
  }

  async importTransaction(transactionHash) {
    try {
      const receipt = await withTimeout(
        this.db.web3.getTransactionReceipt(transactionHash),
        5000
      );
      const transaction = await upsert(
        this.db.pg,
        "transactions",
        this.transactionJson(receipt),
        "(hash)"
      );
      await Promise.all([
        this.importAddress(receipt.to),
        this.importAddress(receipt.from)
      ]);
      const logs = await this.importLogs(receipt);
      const internalTransactions = await this.importInternalTransactions(
        receipt
      );
      console.log(`Downloaded transaction ${transaction.hash}`);
    } catch (err) {
      console.log(
        `Failed to import transaction ${transactionHash}, un-locking...`,
        err
      );
      return this.unlockTransaction(transactionHash);
    }
  }

  async unlockTransaction(hash) {
    const unlocked = await this.db
      .pg("transactions")
      .where("hash", hash)
      .returning("hash")
      .update({ locked_by: null, locked_at: null });
    return unlocked;
  }

  async importLogs(receipt) {
    let decoded;
    const contract = await this.db
      .pg("addresses")
      .where("address", receipt.to)
      .first();
    if (contract && contract.abi) {
      try {
        const decoder = Eth.abi.logDecoder(contract.abi);
        decoded = decoder(receipt.logs);
      } catch (error) {
        decoded = [];
      }
    } else {
      decoded = [];
    }
    return Promise.all(
      receipt.logs.map((log, index) => {
        return this.importLog(log, decoded[index], receipt.blockHash);
      })
    );
  }

  async importInternalTransactions(receipt) {
    const response = await withTimeout(
      this.db.etherscan.account.txlistinternal(receipt.transactionHash),
      5000
    );

    return Promise.all(
      response.result.map(internalTransaction => {
        return this.importInternalTransaction(internalTransaction, receipt);
      })
    );
  }

  async importLog(log, decoded, blockHash) {
    const saved = await upsert(
      this.db.pg,
      "logs",
      this.logJson(log, decoded, blockHash),
      "(transaction_hash, log_index)"
    );
    console.log(`Downloaded log ${log.transactionHash}:${log.logIndex}`);
  }

  async importInternalTransaction(transaction, receipt) {
    try {
      savedTransactions = await this.db
        .pg("internal_transactions")
        .insert(this.internalTransactionJson(transaction, receipt));
      console.log(
        `Downloaded internal transaction ${receipt.transactionHash}:${
          receipt.blockHash
        }`
      );
    } catch (err) {
      // Silence duplicate errors
    }
  }

  async importAddress(address) {
    try {
      const bytecode = await this.db.web3.getCode(address);
      const saved = await this.db
        .pg("addresses")
        .insert(this.addressJson(address, bytecode));
      console.log(
        `Downloaded address ${address}${
          bytecode != "0x" ? " (✓ Contract)" : ""
        }`
      );
      return saved;
    } catch (err) {
      return true; // Silence error
    }
  }

  internalTransactionJson(transaction, receipt) {
    return {
      block_number: transaction.blockNumber.toNumber(),
      block_hash: receipt.blockHash,
      transaction_hash: receipt.transactionHash,
      from_address: transaction.from,
      to_address: transaction.to,
      status: "downloaded",
      locked_by: null,
      locked_at: null,
      downloaded_by: this.pid,
      downloaded_at: this.db.pg.fn.now(),
      data: {
        timeStamp: decodeTimeField(transaction.timeStamp),
        value: Eth.fromWei(transaction.value, "ether"),
        contractAddress: transaction.contractAddress,
        input: transaction.input,
        type: transaction.type,
        gas: transaction.gas.toString(10),
        gasUsed: transaction.gasUsed.toString(10),
        isError: transaction.isError === "0" ? false : true,
        errCode: transaction.errCode
      }
    };
  }

  addressJson(address, bytecode) {
    return {
      address: address,
      status: "downloaded",
      is_contract: bytecode != "0x",
      is_erc20: implementsAbi(ERC20.abi, bytecode),
      is_erc721: implementsAbi(ERC721.abi, bytecode)
    };
  }

  logJson(log, decoded = {}, blockHash) {
    return {
      block_hash: blockHash,
      transaction_hash: log.transactionHash,
      log_index: log.logIndex.toNumber(),
      status: "downloaded",
      decoded: decoded,
      data: {
        address: log.address,
        data: log.data,
        blockHash: log.blockHash,
        blockNumber: log.blockNumber.toString(10),
        removed: log.removed,
        transactionIndex: log.transactionIndex.toString(10)
      }
    };
  }

  transactionJson(receipt) {
    return {
      hash: receipt.transactionHash,
      status: "downloaded",
      locked_by: null,
      locked_at: null,
      downloaded_by: this.pid,
      downloaded_at: this.db.pg.fn.now(),
      receipt: {
        blockHash: receipt.blockHash,
        blockNumber: receipt.blockNumber.toNumber(),
        contractAddress: receipt.contractAddress,
        cumulativeGasUsed: receipt.cumulativeGasUsed.toString(10),
        from: receipt.from,
        gasUsed: receipt.gasUsed.toString(10),
        to: receipt.to,
        logsBloom: receipt.logsBloom,
        status: receipt.status,
        transactionIndex: receipt.transactionIndex
      }
    };
  }
}
