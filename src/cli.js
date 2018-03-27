#!/usr/bin/env node

require("dotenv").config();

import program from "commander";
import clui from "clui";
import { observe } from "mobx";
import initDb from "./db";
import ES, { indices } from "./lib/ES";
import Importer from "./lib/Importer";
import Indexer from "./lib/Indexer";

program
  .command("import")
  .description("import block(s) from Ethereum to Parr")
  .option("-B, --block <n>", "Block number to parse", parseInt)
  .option("-F, --from <n>", "Block number to start parsing at", parseInt)
  .option("-T, --to <n>", "Block number to parse up to", parseInt)
  .option("-L, --last <n>", "Parse the last n blocks", parseInt)
  .action(async options => {
    const db = await initDb();
    try {
      const importer = new Importer(db, options);
      const progress = new clui.Progress(25);
      process.stdout.write(
        `${progress.update(0)}\t${importer.totalImported} of ${
          importer.total
        } Imported`
      );
      observe(importer, "importedPerc", change => {
        process.stdout.clearLine();
        process.stdout.cursorTo(0);
        process.stdout.write(
          `${progress.update(change.newValue)}\t${importer.totalImported} of ${
            importer.total
          } Imported`
        );
      });
      await importer.import();
      process.stdout.write("\n");
    } catch (err) {
      console.log(`Error: ${err}`);
    }
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
      observe(indexer, "indexerPerc", change => {
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
  .action(options => {
    const elasticsearch = new ES();
    elasticsearch.resetIndices();
    console.log(`Reset elasticsearch indices: ${indices}`);
  });

program.parse(process.argv);
