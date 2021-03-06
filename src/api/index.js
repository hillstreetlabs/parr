import { version } from "../../package.json";
import { Router } from "express";
import { abiToSignatures } from "../util/implementsAbi";
import queries from "./queries";
import stats from "./stats";

export default ({ config, db }) => {
  let api = Router();

  api.post("/blocks_transactions", async (req, res) => {
    try {
      const response = await db.elasticsearch.client.search({
        index: "parr_blocks_transactions",
        body: req.body
      });
      res.json({ response });
    } catch (error) {
      res.status(400).json({ response: error });
    }
  });

  api.post("/addresses", async (req, res) => {
    try {
      const response = await db.elasticsearch.client.search({
        index: "parr_addresses",
        body: req.body
      });
      res.json({ response });
    } catch (error) {
      res.status(400).json({ response: error });
    }
  });

  api.post("/implements_abi", async (req, res) => {
    const signaturesString = abiToSignatures(req.body.abi).join(" ");
    const query = {
      index: "parr_addresses",
      body: {
        from: req.body.from,
        size: req.body.size,
        query: {
          match: {
            bytecode: {
              query: signaturesString,
              operator: "and",
              zero_terms_query: "all"
            }
          }
        }
      }
    };
    try {
      const response = await db.elasticsearch.client.search(query);
      res.json({ response });
    } catch (error) {
      res.status(400).json({ response: error });
    }
  });

  api.options("/*", (req, res) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE,OPTIONS");
    res.header(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, Content-Length, X-Requested-With"
    );
    res.send(200);
  });

  // perhaps expose some API metadata at the root
  api.get("/", (req, res) => {
    const { elasticsearch, web3 } = db;
    const provider = web3.currentProvider;
    res.json({ version, provider });
  });

  api.use("/queries", queries({ config, db }));
  api.use("/stats", stats({ config, db }));

  return api;
};
