#!/usr/bin/env node

require("dotenv").config();
import "source-map-support/register";

import program from "commander";
import clui from "clui";
import { observe } from "mobx";
import initDb from "./db";
import fs from "fs";

import BlockIndexer from "./lib/BlockIndexer";
import TransactionIndexer from "./lib/TransactionIndexer";
import AddressIndexer from "./lib/AddressIndexer";
import BlockImporter from "./lib/BlockImporter";
import BlockWatcher from "./lib/BlockWatcher";
import BlockDownloader from "./lib/BlockDownloader";
import TransactionDownloader from "./lib/TransactionDownloader";
import InternalTransactionDownloader from "./lib/InternalTransactionDownloader";
import implementsAbi from "./util/implementsAbi";

program
  .command("watch")
  .description("watch for new blocks and import them")
  .action(async options => {
    const db = await initDb();
    const watcher = new BlockWatcher(db);
    watcher.run();
  });

program
  .command("import")
  .description("import block number(s) from Ethereum to Parr")
  .option("-B, --block <n>", "Block number to parse", parseInt)
  .option("-F, --from <n>", "Block number to start parsing at", parseInt)
  .option("-T, --to <n>", "Block number to parse up to", parseInt)
  .option("-L, --last <n>", "Parse the last n blocks", parseInt)
  .option("-A, --all", "Parse all blocks")
  .action(async options => {
    const db = await initDb();
    const importer = new BlockImporter(db);
    try {
      const latest = (await db.web3.blockNumber()).toNumber() - 6;
      const promises = [];
      if (options.block) promises.push(importer.importBlock(options.block));
      if (options.last) {
        promises.push(
          importer.importBlocks(latest - (options.last - 1), latest)
        );
      }
      if (options.from || options.to) {
        const fromBlock = options.from || 1;
        const toBlock = options.to || latest;
        if (toBlock < fromBlock)
          throw "toBlock must be greater than or equal to fromBlock";
        promises.push(importer.importBlocks(fromBlock, toBlock));
      }
      if (options.all) {
        promises.push(importer.importBlocks(1, latest));
      }
      await Promise.all(promises);
      db.pg.destroy();
    } catch (err) {
      console.log("Encountered error, shutting down");
      db.pg.destroy();
    }
  });

program
  .command("downloadBlocks")
  .description("Download block data from Ethereum ")
  .action(async options => {
    const db = await initDb();
    const downloader = new BlockDownloader(db);
    downloader.run();
    process.on("SIGINT", () => downloader.exit());
  });

program
  .command("downloadTransactions")
  .description("download transaction(s) from Ethereum to Parr")
  .action(async options => {
    const db = await initDb();
    const downloader = new TransactionDownloader(db);
    downloader.run();
    process.on("SIGINT", () => downloader.exit());
  });

program
  .command("downloadInternalTransactions")
  .description("download internal transaction(s) from Ethereum to Parr")
  .action(async options => {
    const db = await initDb();
    const downloader = new InternalTransactionDownloader(db);
    downloader.run();
    process.on("SIGINT", () => downloader.exit());
  });

program
  .command("indexTransactions")
  .description("index transaction(s) from Parr PG instance to Parr ES instance")
  .action(async options => {
    const db = await initDb();
    const indexer = new TransactionIndexer(db);
    indexer.run();
    process.on("SIGINT", () => indexer.exit());
  });

program
  .command("indexBlocks")
  .description("index block(s) from Parr PG instance to Parr ES instance")
  .action(async options => {
    const db = await initDb();
    const indexer = new BlockIndexer(db);
    indexer.run();
    process.on("SIGINT", () => indexer.exit());
  });

program
  .command("indexAddresses")
  .description("index address(es) from Parr PG instance to Parr ES instance")
  .action(async options => {
    const db = await initDb();
    const indexer = new AddressIndexer(db);
    indexer.run();
    process.on("SIGINT", () => indexer.exit());
  });

program
  .command("importContract")
  .description("import a contract ABI")
  .option("-F, --file <dir>", "path to contract JSON with `abi` attribute")
  .option("-A, --address <n>", "contract address on the chain")
  .action(async options => {
    const db = await initDb();

    console.log(`Reading contract file…`);
    const contractFileContent = fs.readFileSync(options.file);

    console.log(`Parsing contract JSON…`);
    const contractJSON = JSON.parse(contractFileContent);

    console.log(`Inserting contract ABI…`);
    await db.pg("contracts").insert({
      address: options.address,
      abi: JSON.stringify(contractJSON.abi)
    });

    console.log(`Done.`);
    db.pg.destroy();
  });

program
  .command("seedContracts")
  .description("Import generic contracts")
  .action(async () => {
    const util = require("util");
    const readdir = util.promisify(fs.readdir);
    const readFile = util.promisify(fs.readFile);
    const db = await initDb();

    console.log(`Reading contract files…`);
    let _err,
      fileNames = await readdir("./contracts/");
    let fileContents = await Promise.all(
      fileNames.map(fileName => {
        let fullFilePath = `./contracts/${fileName}`;
        return readFile(fullFilePath);
      })
    );

    console.log(`Parsing contract JSON…`);
    let contractAttributes = fileContents.map(fileContent => {
      let contractJSON = JSON.parse(fileContent);
      return { abi: JSON.stringify(contractJSON.abi) };
    });

    console.log(`Inserting contract ABIs…`);
    await db.pg("contracts").insert(contractAttributes);

    db.pg.destroy();
  });

program
  .command("implements")
  .description("Check address for ERC standards")
  .option("-F, --file <dir>", "path to contract JSON with `abi` attribute")
  .option("-A, --address <n>", "contract address on the chain")
  .action(async options => {
    const db = await initDb();
    const contractFileContent = fs.readFileSync(options.file);
    const contractJSON = JSON.parse(contractFileContent);
    const bytecode = await db.web3.getCode(options.address);
    const result = implementsAbi(contractJSON.abi, bytecode);
    const answer = result ? "DOES" : "DOES NOT";
    console.log(
      `Address ${options.address} ${answer} implement ${options.file}`
    );
  });

program
  .command("es:reset")
  .description("reset Elasticsearch")
  .action(async options => {
    const { elasticsearch } = await initDb();
    try {
      const receipt = await elasticsearch.reset();
      console.log(`Reset elasticsearch index`, receipt);
    } catch (err) {
      console.log(`Error`, err);
    }
  });

program.parse(process.argv);
