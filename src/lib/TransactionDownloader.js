import uuid from "uuid";
import Eth from "ethjs";
import upsert from "../util/upsert";
import withTimeout from "../util/withTimeout";
import implementsAbi from "../util/implementsAbi";
import ERC20 from "../../contracts/ERC20.json";
import ERC721 from "../../contracts/ERC721.json";
import ERC721Original from "../../contracts/ERC721-original.json";
import { Line, LineBuffer, Clear } from "clui";
import { observable, autorun } from "mobx";
import createTimer from "../util/createTimer";

const BATCH_SIZE = 50;
const DELAY = 5000;

export default class TransactionDownloader {
  @observable transactionCount = 0;
  @observable addressCount = 0;
  @observable errorCount = 0;
  @observable logCount = 0;
  errors = [];
  contractCount = 0;
  erc20Count = 0;
  erc721Count = 0;
  erc721OriginalCount = 0;

  constructor(db) {
    this.db = db;
    this.pid = `TransactionDownloader@${uuid.v4()}`;
    this.timer = createTimer();

    this.stopPrintingStats = autorun(() => this.printStats());
    this.startedAt = new Date().getTime();
  }

  async run() {
    if (this.isExiting) return;
    let transactions = await this.getTransactions();
    if (transactions.length > 0) {
      await this.importTransactions(transactions);
      this.run();
    } else {
      console.log(`No imported transactions found, waiting ${DELAY}ms`);
      this.timeout = setTimeout(() => this.run(), DELAY);
    }
  }

  async exit() {
    this.isExiting = true;
    console.log("Exiting...");
    console.log("Errors", this.errors);
    clearTimeout(this.timeout);
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

  async getTransactions() {
    const timer = this.timer.time("postgres");
    const result = await this.db.pg.transaction(async trx => {
      const transactions = await trx
        .select()
        .from("transactions")
        .where({ status: "imported", locked_by: null })
        .limit(BATCH_SIZE);
      const hashes = await trx
        .select()
        .from("transactions")
        .whereIn("id", transactions.map(t => t.id))
        .returning("hash")
        .update({
          locked_by: this.pid,
          locked_at: this.db.pg.fn.now()
        });
      return transactions;
    });
    timer.stop();
    return result;
  }

  async importTransactions(transactions) {
    await Promise.all(
      transactions.map(transaction => {
        return this.importTransaction(transaction);
      })
    );
  }

  async importTransaction(transaction) {
    try {
      let timer = this.timer.time("download");
      const receipt = await withTimeout(
        this.db.web3.getTransactionReceipt(transaction.hash),
        5000
      );

      timer.stop();
      timer = this.timer.time("postgres");
      await Promise.all([
        this.importAddress(receipt.to || receipt.contractAddress),
        this.importAddress(receipt.from)
      ]);
      const logs = await this.importLogs(
        receipt.to || receipt.contractAddress,
        receipt.logs
      );
      await upsert(
        this.db.pg,
        "transactions",
        this.transactionJson(transaction, receipt),
        "(hash)"
      );
      timer.stop();
      this.transactionCount++;
    } catch (err) {
      this.errorCount++;
      this.errors.push(err);
      return this.unlockTransaction(transaction);
    }
  }

  async unlockTransaction(transaction) {
    const timer = this.timer.time("postgres");
    const unlocked = await this.db
      .pg("transactions")
      .where("hash", transaction.hash)
      .returning("hash")
      .update({ locked_by: null, locked_at: null });
    timer.stop();
    return unlocked;
  }

  async importLogs(contractAddress, logs) {
    let decoded;
    const contract = await this.db
      .pg("addresses")
      .where("address", contractAddress)
      .first();
    if (contract && contract.abi) {
      try {
        const decoder = Eth.abi.logDecoder(contract.abi);
        decoded = decoder(logs);
      } catch (error) {
        decoded = [];
      }
    } else {
      decoded = [];
    }
    return Promise.all(
      logs.map((log, index) => {
        return this.importLog(log, decoded[index]);
      })
    );
  }

  async importLog(log, decoded) {
    const saved = await upsert(
      this.db.pg,
      "logs",
      this.logJson(log, decoded),
      "(transaction_hash, log_index)"
    );
    this.logCount++;
    return saved;
  }

  async importAddress(address) {
    try {
      const bytecode = await withTimeout(this.db.web3.getCode(address), 5000);
      const addressJson = this.addressJson(address, bytecode);
      const saved = await this.db.pg("addresses").insert(addressJson);
      if (addressJson.is_contract) this.contractCount++;
      if (addressJson.is_erc20) this.erc20Count++;
      if (addressJson.is_erc721) this.erc721Count++;
      if (addressJson.is_erc721_original) this.erc721OriginalCount++;
      this.addressCount++;
      return saved;
    } catch (e) {
      if (e.code == "23505") return true; // Silence duplicate key error
      throw e;
    }
  }

  addressJson(address, bytecode) {
    return {
      address: address,
      status: "downloaded",
      is_contract: bytecode != "0x",
      is_erc20: implementsAbi(ERC20.abi, bytecode),
      is_erc721: implementsAbi(ERC721.abi, bytecode),
      is_erc721_original: implementsAbi(ERC721Original.abi, bytecode)
    };
  }

  logJson(log, decoded = {}) {
    return {
      block_hash: log.blockHash,
      transaction_hash: log.transactionHash,
      log_index: log.logIndex.toNumber(),
      status: "downloaded",
      decoded: decoded,
      data: {
        address: log.address,
        data: log.data,
        blockNumber: log.blockNumber.toNumber(),
        removed: log.removed,
        transactionIndex: log.transactionIndex.toNumber()
      }
    };
  }

  transactionJson(transaction, receipt) {
    return {
      hash: transaction.hash,
      status: "downloaded",
      locked_by: null,
      locked_at: null,
      downloaded_by: this.pid,
      downloaded_at: this.db.pg.fn.now(),
      to_address: transaction.to_address || receipt.contractAddress,
      receipt: {
        contractAddress: receipt.contractAddress,
        cumulativeGasUsed: receipt.cumulativeGasUsed.toString(10),
        gasUsed: receipt.gasUsed.toString(10),
        status: receipt.status
      }
    };
  }

  printStats() {
    const now = new Date().getTime();
    const totalSeconds = (now - this.startedAt) / 1000;

    Clear();
    const outputBuffer = new LineBuffer({
      x: 0,
      y: 0,
      width: "console",
      height: "console"
    });

    // Speed info
    new Line(outputBuffer)
      .column("Transactions", 13)
      .column("Addresses", 13)
      .column("Logs", 13)
      .column("Errors", 7)
      .fill()
      .output();
    new Line(outputBuffer)
      .column(
        `${this.transactionCount} (${Math.floor(
          this.transactionCount / totalSeconds
        )}/s)`,
        13
      )
      .column(
        `${this.addressCount} (${Math.floor(
          this.addressCount / totalSeconds
        )}/s)`,
        13
      )
      .column(
        `${this.logCount} (${Math.floor(this.logCount / totalSeconds)}/s)`,
        13
      )
      .column(`${this.errorCount}`, 7)
      .fill()
      .output();
    new Line(outputBuffer).fill().output();

    // Contract info
    new Line(outputBuffer)
      .column("Contracts", 13)
      .column("ERC20", 13)
      .column("ERC721", 13)
      .column("ERC721 (Old)", 13)
      .fill()
      .output();
    new Line(outputBuffer)
      .column(`${this.contractCount}`, 13)
      .column(`${this.erc20Count}`, 13)
      .column(`${this.erc721Count}`, 13)
      .column(`${this.erc721OriginalCount}`, 13)
      .fill()
      .output();
    new Line(outputBuffer).fill().output();

    // Time
    const times = this.timer.get();
    const totalTime = times.postgres + times.download;
    const postgresPerc = Math.floor(100 * times.postgres / totalTime);
    const downloadPerc = Math.floor(100 * times.download / totalTime);
    new Line(outputBuffer)
      .column("Time", 13)
      .column("Postgres", 13)
      .column("Download", 13)
      .fill()
      .output();
    new Line(outputBuffer)
      .column(`${Math.floor(totalSeconds)}s`, 13)
      .column(`${postgresPerc}%`, 13)
      .column(`${downloadPerc}%`, 13)
      .fill()
      .output();

    outputBuffer.output();
  }
}
