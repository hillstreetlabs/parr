#!/usr/bin/env node

require("dotenv").config();
import "source-map-support/register";

import program from "commander";
import initDb from "./db";

import BlockAdder from "./services/BlockAdder";
import BlockWatcher from "./services/BlockWatcher";
import BlockImporter from "./services/BlockImporter";
import BlockIndexer from "./services/BlockIndexer";

import TransactionImporter from "./services/TransactionImporter";
import TransactionIndexer from "./services/TransactionIndexer";

import AddressImporter from "./services/AddressImporter";
import AddressIndexer from "./services/AddressIndexer";

import StatsMonitor from "./services/StatsMonitor";

program
  .command("blocks:add")
  .description("Add blocks from Ethereum to Parr")
  .option("-B, --block <n>", "Block number to parse", parseInt)
  .option("-F, --from <n>", "Block number to start parsing at", parseInt)
  .option("-T, --to <n>", "Block number to parse up to", parseInt)
  .option("-L, --last <n>", "Parse the last n blocks", parseInt)
  .option("-A, --all", "Parse all blocks")
  .action(async options => {
    const db = initDb();
    const adder = new BlockAdder(db);
    try {
      const latest = (await db.web3.blockNumber()).toNumber() - 6;
      const promises = [];
      if (options.block) promises.push(adder.addBlock(options.block));
      if (options.last) {
        promises.push(adder.addBlocks(latest - (options.last - 1), latest));
      }
      if (options.from || options.to) {
        const fromBlock = options.from || 1;
        const toBlock = options.to || latest;
        if (toBlock < fromBlock)
          throw "toBlock must be greater than or equal to fromBlock";
        promises.push(adder.addBlocks(fromBlock, toBlock));
      }
      if (options.all) {
        promises.push(adder.addBlocks(1, latest));
      }
      await Promise.all(promises);
      db.pg.destroy();
      db.redis.end(true);
    } catch (err) {
      console.log("Encountered error, shutting down");
      db.pg.destroy();
      db.redis.end(true);
    }
  });

program
  .command("blocks:import")
  .description("Import block data from Ethereum ")
  .action(async options => {
    const db = initDb();
    const importer = new BlockImporter(db);
    importer.run();
    process.on("SIGINT", () => importer.exit());
  });

program
  .command("blocks:watch")
  .description("Watch for new blocks and add them")
  .action(async options => {
    const db = initDb();
    const watcher = new BlockWatcher(db);
    watcher.run();
  });

program
  .command("blocks:index")
  .description("index block(s) from Parr PG instance to Parr ES instance")
  .action(async options => {
    const db = initDb();
    const indexer = new BlockIndexer(db);
    indexer.run();
    process.on("SIGINT", () => indexer.exit());
  });

program
  .command("transactions:import")
  .description("Import transaction(s) from Ethereum to Parr")
  .action(async options => {
    const db = initDb();
    const importer = new TransactionImporter(db);
    importer.run();
    process.on("SIGINT", () => importer.exit());
  });

program
  .command("transactions:index")
  .description("index transaction(s) from Parr PG instance to Parr ES instance")
  .action(async options => {
    const db = initDb();
    const indexer = new TransactionIndexer(db);
    indexer.run();
    process.on("SIGINT", () => indexer.exit());
  });

program
  .command("addresses:import")
  .description("Import address(es) and check against known ABIs")
  .action(async options => {
    const db = initDb();
    const importer = new AddressImporter(db);
    importer.run();
    process.on("SIGINT", () => importer.exit());
  });

program
  .command("addresses:index")
  .description("index address(es) from Parr PG instance to Parr ES instance")
  .action(async options => {
    const db = initDb();
    const indexer = new AddressIndexer(db);
    indexer.run();
    process.on("SIGINT", () => indexer.exit());
  });

program
  .command("monitor")
  .description("monitor stats for blocks")
  .action(async options => {
    const db = initDb();
    const monitor = new StatsMonitor(db);
    monitor.run();
    process.on("SIGINT", () => monitor.exit());
  });

program
  .command("es:reset")
  .description("reset Elasticsearch")
  .action(async options => {
    const { elasticsearch, pg, redis } = initDb();
    try {
      const receipt = await elasticsearch.reset();
      // TODO: figure out a nice way of moving things to different queues
      // so that we can reindex things here.
      pg.destroy();
      redis.end(true);
      console.log(`Reset elasticsearch index`, receipt);
    } catch (err) {
      console.log(`Error`, err);
    }
  });

program.parse(process.argv);
