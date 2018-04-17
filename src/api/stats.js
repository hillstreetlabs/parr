import { version } from "../../package.json";
import Eth from "ethjs";
import { Router } from "express";
import { INDICES } from "../db/ES";

export default ({ config, db }) => {
  let api = Router();

  api.use("/monitoring", async (req, res) => {
    try {
      const response = await db.elasticsearch.client.search({
        index: "parr_monitoring",
        body: { query: { match_all: {} } }
      });
      res.json({ response });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  api.use("/", async (req, res) => {
    let blockCount = db.pg("blocks").count();

    let blockCountByStatus = db
      .pg("blocks")
      .select("status")
      .groupBy("status")
      .count();

    let transactionCount = db.pg("transactions").count();

    let transactionCountByStatus = db
      .pg("transactions")
      .select("status")
      .groupBy("status")
      .count();

    let logCount = db.pg("logs").count();

    let logCountByStatus = db
      .pg("logs")
      .select("status")
      .groupBy("status")
      .count();
    let logDecodedCount = db
      .pg("logs")
      .whereRaw("decoded::text <> '{}'::text")
      .count();

    let addressCount = db.pg("addresses").count();
    let addressCountByStatus = db
      .pg("addresses")
      .select("status")
      .groupBy("status")
      .count();

    let contractCount = db
      .pg("addresses")
      .whereNot("bytecode", "0x")
      .count();

    let esStats = db.elasticsearch.client.indices.stats({
      index: INDICES.map(index => index.name)
    });

    [
      blockCount,
      blockCountByStatus,
      transactionCount,
      transactionCountByStatus,
      logCount,
      logCountByStatus,
      logDecodedCount,
      addressCount,
      addressCountByStatus,
      contractCount,
      esStats
    ] = await Promise.all([
      blockCount,
      blockCountByStatus,
      transactionCount,
      transactionCountByStatus,
      logCount,
      logCountByStatus,
      logDecodedCount,
      addressCount,
      addressCountByStatus,
      contractCount,
      esStats
    ]);

    res.json({
      blocks: {
        total_count: blockCount[0].count,
        count_by_status: blockCountByStatus
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
      addresses: {
        total_count: addressCount[0].count,
        contract_count: contractCount[0].count,
        count_by_status: addressCountByStatus
      },
      elasticsearch: esStats
    });
  });

  return api;
};
