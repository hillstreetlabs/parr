#!/usr/bin/env node

require("dotenv").config();
import Elasticsearch from "elasticsearch";
import { BlockAndLogStreamer } from "ethereumjs-blockstream";
import gettersWithWeb3 from "../lib/BlockStream";
import Parser from "../lib/parser";

const client = new Elasticsearch.Client({
  host: process.env.ELASTICSEARCH_URL,
  log: "trace"
});

const parser = new Parser();
const getters = gettersWithWeb3(
  `https://${process.env.INFURA_NETWORK}.infura.io/${process.env.INFURA_KEY}`
);
const streamer = new BlockAndLogStreamer(
  getters.getBlockByHash,
  getters.getLogs,
  {
    blockRetention: 100
  }
);

streamer.subscribeToOnBlockAdded(block => {
  console.log(parser.parseBlock(block));
  // console.log("TRANSACTIONS           ", block.result.transactions);
});

setInterval(async () => {
  console.log("HERE");
  streamer.reconcileNewBlock(await getters.getLatestBlock());
}, 1000);

// // ["blocks", "transactions", "logs", "accounts"].map(async name => {
// //   const indexName = `parr-${name}`;
// //   const indexExists = await client.indices.exists({ index: indexName });
// //   if (indexExists) await client.indices.delete({ index: indexName });
// //   client.indices.create({ index: indexName });
// // });
