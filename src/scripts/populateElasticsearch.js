#!/usr/bin/env node

require("dotenv").config();
import Elasticsearch from "elasticsearch";
import Eth from "ethjs";
import gettersWithWeb3 from "../lib/BlockStream";
import Parser from "../lib/parser";
import { Ethmoji } from "ethmoji-contracts";

const client = new Elasticsearch.Client({
  host: process.env.ELASTICSEARCH_URL,
  log: "trace"
});

const eth = new Eth(
  new Eth.HttpProvider(
    `https://${process.env.INFURA_NETWORK}.infura.io/${process.env.INFURA_KEY}`
  )
);
const parser = new Parser();
const ethmoji = eth
  .contract(Ethmoji.abi)
  .at("0xa6d954d08877f8ce1224f6bfb83484c7d3abf8e9");
const decoder = Eth.abi.logDecoder(ethmoji.abi);

function resolveAfter2Seconds() {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve("resolved");
    }, 2000);
  });
}

async function parseBlock(blockNumber) {
  const block = await eth.getBlockByNumber(blockNumber, true);
  const parsedBlock = parser.parseBlock(block);
  const parsedTransactions = parsedBlock.transactions.map(async txn => {
    const receipt = await eth.getTransactionReceipt(txn.hash);
    txn.cumulativeGasUsed = receipt.cumulativeGasUsed.toString(10);
    txn.gasUsed = receipt.gasUsed.toString(10);

    let decoded;
    try {
      decoded = decoder(receipt.logs);
    } catch (error) {
      decoded = [];
    }
    txn.logs = receipt.logs.map((log, index) => {
      return parser.parseLog(log, decoded[index]);
    });
    return txn;
  });
}

parseBlock(5311100);
