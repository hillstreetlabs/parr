#!/usr/bin/env node

require("dotenv").config();
import "source-map-support/register";

import program from "commander";
import initDb from "./db";

import BlockIndexer from "./lib/BlockIndexer";
import TransactionIndexer from "./lib/TransactionIndexer";
import AddressIndexer from "./lib/AddressIndexer";
import BlockImporter from "./lib/BlockImporter";
import BlockWatcher from "./lib/BlockWatcher";
import BlockDownloader from "./lib/BlockDownloader";
import TransactionDownloader from "./lib/TransactionDownloader";
import InternalTransactionDownloader from "./lib/InternalTransactionDownloader";
import AddressImporter from "./lib/AddressImporter";

program
  .command("watch")
  .description("watch for new blocks and import them")
  .action(async options => {
    const db = initDb();
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
    const db = initDb();
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
    const db = initDb();
    const downloader = new BlockDownloader(db);
    downloader.run();
    process.on("SIGINT", () => downloader.exit());
  });

program
  .command("downloadTransactions")
  .description("download transaction(s) from Ethereum to Parr")
  .action(async options => {
    const db = initDb();
    const downloader = new TransactionDownloader(db);
    downloader.run();
    process.on("SIGINT", () => downloader.exit());
  });

program
  .command("downloadInternalTransactions")
  .description("download internal transaction(s) from Ethereum to Parr")
  .action(async options => {
    const db = initDb();
    const downloader = new InternalTransactionDownloader(db);
    downloader.run();
    process.on("SIGINT", () => downloader.exit());
  });

program
  .command("indexTransactions")
  .description("index transaction(s) from Parr PG instance to Parr ES instance")
  .action(async options => {
    const db = initDb();
    const indexer = new TransactionIndexer(db);
    indexer.run();
    process.on("SIGINT", () => indexer.exit());
  });

program
  .command("indexBlocks")
  .description("index block(s) from Parr PG instance to Parr ES instance")
  .action(async options => {
    const db = initDb();
    const indexer = new BlockIndexer(db);
    indexer.run();
    process.on("SIGINT", () => indexer.exit());
  });

program
  .command("indexAddresses")
  .description("index address(es) from Parr PG instance to Parr ES instance")
  .action(async options => {
    const db = initDb();
    const indexer = new AddressIndexer(db);
    indexer.run();
    process.on("SIGINT", () => indexer.exit());
  });

program
  .command("importAddresses")
  .description(
    "import address(es) marked as stale and check against known ABIs"
  )
  .action(async options => {
    const db = initDb();
    const importer = new AddressImporter(db);
    importer.run();
    process.on("SIGINT", () => importer.exit());
  });

program
  .command("es:reset")
  .description("reset Elasticsearch")
  .action(async options => {
    const { elasticsearch, pg } = initDb();
    try {
      const receipt = await elasticsearch.reset();
      await pg("blocks")
        .where("status", "indexed")
        .update("status", "downloaded");
      await pg("transactions")
        .where("status", "indexed")
        .update("status", "downloaded");
      await pg("addresses")
        .where("status", "indexed")
        .update("status", "downloaded");
      pg.destroy();
      console.log(`Reset elasticsearch index`, receipt);
    } catch (err) {
      console.log(`Error`, err);
    }
  });

program.parse(process.argv);
