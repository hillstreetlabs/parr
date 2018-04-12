import { version } from "../../package.json";
import Eth from "ethjs";
import { Router } from "express";
import { INDICES } from "../lib/ES";

export default ({ config, db }) => {
  let api = Router();

  api.use("/", async (req, res) => {
    const blockCount = await db.pg("blocks").count();

    const blockCountByStatus = await db
      .pg("blocks")
      .select("status")
      .groupBy("status")
      .count();

    const transactionCount = await db.pg("transactions").count();

    const transactionCountByStatus = await db
      .pg("transactions")
      .select("status")
      .groupBy("status")
      .count();

    const logCount = await db.pg("logs").count();

    const logCountByStatus = await db
      .pg("logs")
      .select("status")
      .groupBy("status")
      .count();
    const logDecodedCount = await db
      .pg("logs")
      .whereRaw("decoded::text <> '{}'::text")
      .count();

    const addressCount = await db.pg("addresses").count();
    const addressCountByStatus = await db
      .pg("addresses")
      .select("status")
      .groupBy("status")
      .count();

    const contractCount = await db
      .pg("addresses")
      .whereNot("bytecode", "0x")
      .count();

    const esStats = await db.elasticsearch.client.indices.stats({
      index: INDICES.map(index => index.name)
    });

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
