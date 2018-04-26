#!/usr/bin/env node

require("dotenv").config();
import "source-map-support/register";

import program from "commander";
import initDb from "./db";
import inBatches from "./util/inBatches";
import { Spinner } from "clui";

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
  .command("reimport")
  .description("reimport rows")
  .option("-T, --type <type>", "type to re-import")
  .action(async options => {
    const { pg, redis } = initDb();
    // Add blocks to redis for re-importing
    if (!options.type || options.type === "blocks") {
      let blocksResetCount = 0;
      const blockCounter = new Spinner(`Reset ${blocksResetCount} blocks`);
      blockCounter.start();
      await inBatches(
        pg("blocks"),
        async blocks => {
          await redis.saddAsync(
            "blocks:to_import",
            blocks.map(block => block.hash)
          );
          blocksResetCount += blocks.length;
          blockCounter.message(`Reset ${blocksResetCount} blocks`);
        },
        5000
      );
      blockCounter.stop();
      console.log(`Reset ${blocksResetCount} blocks for re-importing`);
    }
    // Add transactions to redis for re-importing
    if (!options.type || options.type === "transactions") {
      let transactionsResetCount = 0;
      const transactionCounter = new Spinner(
        `Reset ${transactionsResetCount} transactions`
      );
      transactionCounter.start();
      await inBatches(
        pg("transactions"),
        async transactions => {
          await redis.saddAsync(
            "transactions:to_import",
            transactions.map(transaction => transaction.hash)
          );
          transactionsResetCount += transactions.length;
          transactionCounter.message(
            `Reset ${transactionsResetCount} transactions`
          );
        },
        5000
      );
      transactionCounter.stop();
      console.log(
        `Reset ${transactionsResetCount} transactions for re-importing`
      );
    }
    // Add addresses to redis for re-importing
    if (!options.type || options.type === "addresses") {
      let addressesResetCount = 0;
      const addressCounter = new Spinner(
        `Reset ${addressesResetCount} addresses`
      );
      addressCounter.start();
      await inBatches(
        pg("addresses"),
        async addresses => {
          await redis.saddAsync(
            "addresses:to_import",
            addresses.map(address => address.address)
          );
          addressesResetCount += addresses.length;
          addressCounter.message(`Reset ${addressesResetCount} addresses`);
        },
        5000
      );
      addressCounter.stop();
      console.log(`Reset ${addressesResetCount} addresses for re-importing`);
    }
    pg.destroy();
    redis.end(true);
  });

program
  .command("es:reset")
  .description("reset Elasticsearch")
  .option("-I, --index <n>", "index name to reset")
  .action(async options => {
    const { elasticsearch, pg, redis } = initDb();
    try {
      // receipt will be an array of index names (i.e. ["parr_monitoring"])
      const receipt = await elasticsearch.reset(options.index);
      console.log(`Reset elasticsearch indices: ${receipt.join(", ")}`);
      // Add blocks to redis for re-indexing
      let blocksResetCount = 0;
      if (receipt.includes("parr_blocks_transactions")) {
        const blockCounter = new Spinner(`Reset ${blocksResetCount} blocks`);
        blockCounter.start();
        await inBatches(
          pg("blocks"),
          async blocks => {
            await redis.saddAsync(
              "blocks:to_index",
              blocks.map(block => block.hash)
            );
            blocksResetCount += blocks.length;
            blockCounter.message(`Reset ${blocksResetCount} blocks`);
          },
          5000
        );
        blockCounter.stop();
      }
      console.log(`Reset ${blocksResetCount} blocks for re-indexing`);
      // Add transactions to redis for re-indexing
      let transactionsResetCount = 0;
      if (
        receipt.includes("parr_blocks_transactions") ||
        receipt.includes("parr_addresses")
      ) {
        const transactionCounter = new Spinner(
          `Reset ${transactionsResetCount} transactions`
        );
        transactionCounter.start();
        await inBatches(
          pg("transactions"),
          async transactions => {
            await redis.saddAsync(
              "transactions:to_index",
              transactions.map(transaction => transaction.hash)
            );
            transactionsResetCount += transactions.length;
            transactionCounter.message(
              `Reset ${transactionsResetCount} transactions`
            );
          },
          5000
        );
        transactionCounter.stop();
      }
      console.log(
        `Reset ${transactionsResetCount} transactions for re-indexing`
      );
      // Add addresses to redis for re-indexing
      let addressesResetCount = 0;
      if (receipt.includes("parr_addresses")) {
        const addressCounter = new Spinner(
          `Reset ${addressesResetCount} addresses`
        );
        addressCounter.start();
        await inBatches(
          pg("addresses"),
          async addresses => {
            await redis.saddAsync(
              "addresses:to_index",
              addresses.map(address => address.address)
            );
            addressesResetCount += addresses.length;
            addressCounter.message(`Reset ${addressesResetCount} addresses`);
          },
          5000
        );
        addressCounter.stop();
      }
      console.log(`Reset ${addressesResetCount} addresses for re-indexing`);
      pg.destroy();
      redis.end(true);
    } catch (err) {
      console.log(`Error`, err);
    }
  });

program.command("test").action(async options => {});

program.parse(process.argv);
