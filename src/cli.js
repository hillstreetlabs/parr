#!/usr/bin/env node

require("dotenv").config();

import program from "commander";
import clui from "clui";
import { observe } from "mobx";
import initDb from "./db";
import ES, { indices } from "./lib/ES";
import Importer from "./lib/Importer";

program
  .command("import")
  .description("import block(s) from Ethereum to Parr")
  .option("-B, --block <n>", "Block number to parse")
  .action(options => {
    initDb(async db => {
      const importer = new Importer(db, options);
      const progress = new clui.Progress(25);
      process.stdout.write(
        `${progress.update(0)}\t${importer.imported.length} of ${
          importer.total
        } Imported`
      );
      observe(importer, "importedPerc", change => {
        process.stdout.clearLine();
        process.stdout.cursorTo(0);
        process.stdout.write(
          `${progress.update(change.newValue)}\t${
            importer.imported.length
          } of ${importer.total} Imported`
        );
      });
      await importer.import();
      process.stdout.write("\n");
    });
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
