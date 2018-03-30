#!/usr/bin/env node

require("dotenv").config();
import "source-map-support/register";

import program from "commander";
import clui from "clui";
import { observe } from "mobx";
import initDb from "./db";

import TransactionDownloader from "./lib/TransactionDownloader";
import BlockImporter from "./lib/BlockImporter";
import BlockWatcher from "./lib/BlockWatcher";
import BlockDownloader from "./lib/BlockDownloader";
import Indexer from "./lib/Indexer";

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
    const latest = (await db.web3.blockNumber()).toNumber();
    const promises = [];
    if (options.block) promises.push(importer.importBlock(options.block));
    if (options.last) {
      promises.push(importer.importBlocks(latest - (options.last - 1), latest));
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
  .command("index")
  .description("index block(s) from Parr PG instance to Parr ES instance")
  .action(async options => {
    const db = await initDb();
    const indexer = new Indexer(db, options);
    indexer.run();
    process.on("SIGINT", () => indexer.exit());
  });

program
  .command("reset")
  .description("reset Elasticsearch")
  .action(async options => {
    const { elasticsearch } = await initDb();
    elasticsearch.resetIndices();
    console.log(`Reset elasticsearch indices`);
  });

program.parse(process.argv);
