import Elasticsearch from "elasticsearch";
import { version } from "../../package.json";
import Eth from "ethjs";
import { Router } from "express";

export default ({ config, db }) => {
  let api = Router();


  api.use("/", async (req, res) => {

    const elasticsearch = new Elasticsearch.Client({
      host: process.env.ELASTICSEARCH_URL
    });

    const blockCount = await db
      .pg("blocks")
      .count()

    const blockCountByStatus = await db
      .pg("blocks")
      .select("status")
      .groupBy("status")
      .count()

    const mostRecentBlock = await db
      .pg("blocks")
      .orderBy("number")
      .first()

    const transactionCount = await db
      .pg("transactions")
      .count()

    const transactionCountByStatus = await db
      .pg("transactions")
      .select("status")
      .groupBy("status")
      .count()

    const logCount = await db
      .pg("logs")
      .count()

    const logCountByStatus = await db
      .pg("logs")
      .select("status")
      .groupBy("status")
      .count()
    const logDecodedCount = await db
      .pg("logs")
      .whereRaw("decoded::text <> '{}'::text")
      .count()

    const contractCount = await db
      .pg("contracts")
      .count()

    const genericContractCount = await db
      .pg("contracts")
      .whereNull("address")
      .count()

    const elasticSearchIndexStats = await elasticsearch
      .indices
      .stats()

    res.json({
      blocks: {
        total_count: blockCount[0].count,
        count_by_status: blockCountByStatus,
        last: mostRecentBlock
      },
      transactions: {
        total_count: transactionCount[0].count,
        count_by_status: transactionCountByStatus
      },
      logs: {
        total_count: logCount[0].count,
        decoded_count: logDecodedCount[0].count,
        count_by_status: logCountByStatus
      },
      contracts: {
        total_count: contractCount[0].count,
        generic_count: genericContractCount[0].count
      },
      elastic_search: elasticSearchIndexStats
    });
  });

  return api;
};
