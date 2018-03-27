#!/usr/bin/env node

require("dotenv").config();
import "source-map-support/register";

import program from "commander";
import clui from "clui";
import { observe } from "mobx";
import initDb from "./db";
import BlockImporter from "./lib/BlockImporter";
import BlockDownloader from "./lib/BlockDownloader";
import Indexer from "./lib/Indexer";

program
  .command("watch")
  .description("watch for new blocks and import them")
  .action(async options => {
    const db = await initDb();
    const importer = new BlockImporter(db);
    importer.watch();
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
      promises.push(importer.importBlocks(latest - options.last, latest));
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
  .command("download")
  .description("Download blocks that have only been imported")
  .action(async options => {
    const db = await initDb();
    const downloader = new BlockDownloader(db);
    downloader.run();
  });

program
  .command("index")
  .description("index block(s) from Parr PG instance to Parr ES instance")
  .option("-B, --block <n>", "Block number to index", parseInt)
  .option("-F, --from <n>", "Block number to start indexing at", parseInt)
  .option("-T, --to <n>", "Block number to index up to", parseInt)
  .action(async options => {
    const db = await initDb();
    try {
      const indexer = new Indexer(db, options);
      const progress = new clui.Progress(25);
      process.stdout.write(
        `${progress.update(0)}\t${indexer.totalIndexed} of ${
          indexer.total
        } Indexed`
      );
      observe(indexer, "indexedPerc", change => {
        process.stdout.clearLine();
        process.stdout.cursorTo(0);
        process.stdout.write(
          `${progress.update(change.newValue)}\t${indexer.totalIndexed} of ${
            indexer.total
          } Indexed`
        );
      });
      await indexer.index();
      process.stdout.write("\n");
    } catch (err) {
      console.log(`Error: ${err}`);
    }
  });

program
  .command("reset")
  .description("reset Elasticsearch")
  .action(async options => {
    const { elasticsearch } = await initDb();
    elasticsearch.resetIndices();
    console.log(`Reset elasticsearch indices: ${indices}`);
  });

program.parse(process.argv);
