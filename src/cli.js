#!/usr/bin/env node

require("dotenv").config();

import program from "commander";
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
      await importer.import();
      console.log(`Imported block(s): ${options.block}`);
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
