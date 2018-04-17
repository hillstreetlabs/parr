import uuid from "uuid";
import Eth from "ethjs";
import upsert from "../util/upsert";
import withTimeout from "../util/withTimeout";
import { Line, LineBuffer, Clear } from "clui";
import { observable, autorun } from "mobx";
import createTimer from "../util/createTimer";
import { importAddress } from "./AddressImporter";
import genericEventsAbi from "../../contracts/Events.json";

const BATCH_SIZE = 50;
const DELAY = 5000;

export default class TransactionImporter {
  @observable transactionCount = 0;
  @observable errorCount = 0;
  @observable logCount = 0;
  errors = [];

  constructor(db) {
    this.db = db;
    this.pid = `TransactionImporter@${uuid.v4()}`;
    this.timer = createTimer();

    this.stopPrintingStats = autorun(() => this.printStats());
    this.startedAt = new Date().getTime();
  }

  async run() {
    if (this.isExiting) return;
    this.transactionHashes = await this.getTransactionHashes();
    if (this.transactionHashes.length > 0) {
      await this.importTransactions();
      this.run();
    } else {
      console.log(`No transactions found to import, waiting ${DELAY}ms`);
      this.timeout = setTimeout(() => this.run(), DELAY);
    }
  }

  async exit() {
    this.isExiting = true;
    console.log("Exiting...");
    console.log(this.errors);
    clearTimeout(this.timeout);
    if (this.transactionHashes.length > 0)
      await this.db.redis.saddAsync(
        "transactions:to_import",
        this.transactionHashes
      );
    console.log(`Unlocked ${this.transactionHashes.length} transactions`);
    process.exit();
  }

  getTransactionHashes() {
    return this.db.redis.spopAsync("transactions:to_import", BATCH_SIZE);
  }

  async importTransactions() {
    await Promise.all(
      this.transactionHashes.map(hash => {
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

      const transaction = await withTimeout(
        this.db.web3.getTransactionByHash(transactionHash),
        5000
      );

      const to = transaction.to || receipt.contractAddress;

      const toAddress = await this.db.pg
        .from("addresses")
        .where({ address: to })
        .first();
      const fromAddress = await this.db.pg
        .from("addresses")
        .where({ address: transaction.from })
        .first();
      if (!toAddress) await this.db.redis.saddAsync("addresses:to_import", to);
      if (!fromAddress)
        await this.db.redis.saddAsync("addresses:to_import", transaction.from);

      const logs = await this.importLogs(to, receipt.logs);

      await upsert(
        this.db.pg,
        "transactions",
        this.transactionJson(transaction, receipt),
        "(hash)"
      );
      await this.db.redis.saddAsync("transactions:to_index", transactionHash);
      this.transactionCount++;
    } catch (err) {
      this.errorCount++;
      this.errors.push(err);
      return this.unlockTransaction(transactionHash);
    }
  }

  async unlockTransaction(transactionHash) {
    await this.db.redis.saddAsync("transactions:to_import", transactionHash);
  }

  async importLogs(contractAddress, logs) {
    let decoded;
    const contract = await this.db
      .pg("addresses")
      .where("address", contractAddress)
      .first();
    try {
      const contractAbiForDecoding = contract.abi || genericEventsAbi;
      const decoder = Eth.abi.logDecoder(contractAbiForDecoding);
      decoded = decoder(logs);
    } catch (error) {
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
      decoded: decoded,
      data: {
        address: log.address,
        data: log.data,
        blockNumber: log.blockNumber.toNumber(),
        transactionIndex: log.transactionIndex.toNumber()
      }
    };
  }

  transactionJson(transaction, receipt) {
    return {
      hash: transaction.hash,
      to_address: transaction.to || receipt.contractAddress,
      from_address: transaction.from,
      block_hash: transaction.blockHash,
      receipt: {
        contractAddress: receipt.contractAddress,
        cumulativeGasUsed: receipt.cumulativeGasUsed.toString(10),
        gasUsed: receipt.gasUsed.toString(10)
      },
      data: {
        blockNumber: transaction.blockNumber.toNumber(),
        gas: transaction.gas.toString(10),
        gasPrice: Eth.fromWei(transaction.gasPrice, "ether"),
        nonce: transaction.nonce.toString(10),
        transactionIndex: transaction.transactionIndex.toNumber(),
        value: Eth.fromWei(transaction.value, "ether"),
        logs: []
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
    new Line(outputBuffer)
      .column("Time", 13)
      .fill()
      .store();
    new Line(outputBuffer)
      .column(`${Math.floor(totalSeconds)}s`, 13)
      .fill()
      .store();

    outputBuffer.output();
  }
}
