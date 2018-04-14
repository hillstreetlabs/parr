import uuid from "uuid";
import Eth from "ethjs";
import upsert from "../util/upsert";
import withTimeout from "../util/withTimeout";
import { Line, LineBuffer, Clear } from "clui";
import { observable, autorun } from "mobx";
import createTimer from "../util/createTimer";
import { importAddress } from "./AddressImporter";

const BATCH_SIZE = 50;
const DELAY = 5000;

export default class TransactionDownloader {
  @observable transactionCount = 0;
  @observable errorCount = 0;
  @observable logCount = 0;
  errors = [];

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
        importAddress(this.db, receipt.to || receipt.contractAddress),
        importAddress(this.db, receipt.from)
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
      console.log(err);
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
      .column("Logs", 13)
      .column("Errors", 7)
      .fill()
      .store();
    new Line(outputBuffer)
      .column(
        `${this.transactionCount} (${Math.floor(
          this.transactionCount / totalSeconds
        )}/s)`,
        13
      )
      .column(
        `${this.logCount} (${Math.floor(this.logCount / totalSeconds)}/s)`,
        13
      )
      .column(`${this.errorCount}`, 7)
      .fill()
      .store();
    new Line(outputBuffer).fill().store();

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
      .store();
    new Line(outputBuffer)
      .column(`${Math.floor(totalSeconds)}s`, 13)
      .column(`${postgresPerc}%`, 13)
      .column(`${downloadPerc}%`, 13)
      .fill()
      .store();

    outputBuffer.output();
  }
}
