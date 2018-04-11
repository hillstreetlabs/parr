import uuid from "uuid";
import Eth from "ethjs";
import upsert from "../util/upsert";
import withTimeout from "../util/withTimeout";
import implementsAbi from "../util/implementsAbi";
import ERC20 from "../../contracts/ERC20.json";
import ERC721 from "../../contracts/ERC721.json";
import { Line, LineBuffer, Clear } from "clui";
import { observable, autorun } from "mobx";
import createTimer from "../util/createTimer";

const BATCH_SIZE = 50;
const DELAY = 5000;

export default class TransactionDownloader {
  @observable transactionCount = 0;
  @observable addressCount = 0;
  @observable errorCount = 0;
  contractCount = 0;
  erc20Count = 0;
  erc721Count = 0;

  constructor(db) {
    this.db = db;
    this.pid = `TransactionDownloader@${uuid.v4()}`;
    this.timer = createTimer();

    this.stopPrintingStats = autorun(() => this.printStats());
    this.startedAt = new Date().getTime();
  }

  async run() {
    if (this.isExiting) return;

    let transactionHashes = await this.getTransactionHashes();
    if (transactionHashes.length > 0) {
      await this.importTransactions(transactionHashes);
      this.run();
    } else {
      console.log(`No imported transactions found, waiting ${DELAY}ms`);
      this.timeout = setTimeout(() => this.run(), DELAY);
    }
  }

  async exit() {
    this.isExiting = true;

    console.log("Exiting...");
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

  async getTransactionHashes() {
    const timer = this.timer.time("postgres");
    const result = await this.db.pg.transaction(async trx => {
      const transactions = await trx
        .select("id")
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
      return hashes;
    });
    timer.stop();
    return result;
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
      let timer = this.timer.time("download");
      const receipt = await withTimeout(
        this.db.web3.getTransactionReceipt(transactionHash),
        5000
      );

      timer.stop();
      timer = this.timer.time("postgres");
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
      timer.stop();

      this.transactionCount++;
    } catch (err) {
      this.errorCount++;
      // Unlock transaction
      return this.unlockTransaction(transactionHash);
    }
  }

  async unlockTransaction(hash) {
    const timer = this.timer.time("postgres");
    const unlocked = await this.db
      .pg("transactions")
      .where("hash", hash)
      .returning("hash")
      .update({ locked_by: null, locked_at: null });
    timer.stop();
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

  async importLog(log, decoded, blockHash) {
    const saved = await upsert(
      this.db.pg,
      "logs",
      this.logJson(log, decoded, blockHash),
      "(transaction_hash, log_index)"
    );
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
      this.addressCount++;

      return saved;
    } catch (e) {
      // Fail silently :(
    }
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
      .column("Transactions", 17)
      .column("Addresses", 17)
      .column("Errors", 6)
      .fill()
      .output();
    new Line(outputBuffer)
      .column(
        `${this.transactionCount} (${Math.floor(
          this.transactionCount / totalSeconds
        )}/s)`,
        17
      )
      .column(
        `${this.addressCount} (${Math.floor(
          this.addressCount / totalSeconds
        )}/s)`,
        17
      )
      .column(`${this.errorCount}`, 6)
      .fill()
      .output();
    new Line(outputBuffer).fill().output();

    // Contract info
    new Line(outputBuffer)
      .column("Contracts", 17)
      .column("ERC20", 17)
      .column("ERC721", 6)
      .fill()
      .output();
    new Line(outputBuffer)
      .column(`${this.contractCount}`, 17)
      .column(`${this.erc20Count}`, 17)
      .column(`${this.erc721Count}`, 6)
      .fill()
      .output();
    new Line(outputBuffer).fill().output();

    // Time
    const times = this.timer.get();
    const totalTime = times.postgres + times.download;
    const postgresPerc = Math.floor(100 * times.postgres / totalTime);
    const downloadPerc = Math.floor(100 * times.download / totalTime);
    new Line(outputBuffer)
      .column("Time", 10)
      .column("Postgres", 10)
      .column("Download", 10)
      .fill()
      .output();
    new Line(outputBuffer)
      .column(`${Math.floor(totalSeconds)}s`, 10)
      .column(`${postgresPerc}%`, 10)
      .column(`${downloadPerc}%`, 10)
      .fill()
      .output();

    outputBuffer.output();
  }
}
