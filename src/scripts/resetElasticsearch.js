#!/usr/bin/env node

require("dotenv").config();
const Elasticsearch = require("elasticsearch");

const client = new Elasticsearch.Client({
  host: process.env.ELASTICSEARCH_URL,
  log: "trace"
});

["blocks", "transactions", "logs", "accounts"].map(async name => {
  const indexName = `parr-${name}`;
  const indexExists = await client.indices.exists({ index: indexName });
  if (indexExists) await client.indices.delete({ index: indexName });
  client.indices.create({ index: indexName });
});
