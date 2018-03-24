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

function parseBlock(blockNumber) {
  eth.getBlockByNumber(blockNumber, true).then(block => {
    const parsedBlock = parser.parseBlock(block);
    parsedBlock.transactions = parsedBlock.transactions.map(txn => {
      eth.getTransactionReceipt(txn.hash).then(receipt => {
        txn.cumulativeGasUsed = receipt.cumulativeGasUsed.toString(10);
        txn.gasUsed = receipt.gasUsed.toString(10);
        txn.logs = receipt.logs.map(log => {
          return parser.parseLog(log);
        });
      });
      return txn;
    });
  });
}
