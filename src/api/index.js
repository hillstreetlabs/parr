import { version } from "../../package.json";
import { Router } from "express";
import { abiToSignatures } from "../util/implementsAbi";

export default ({ config, db }) => {
  let api = Router();

  api.post("/blocks_transactions", async (req, res) => {
    const response = await db.elasticsearch.client.search({
      index: "parr_blocks_transactions",
      body: req.body
    });
    res.json({ response: response.hits });
  });

  api.post("/addresses", async (req, res) => {
    const response = await db.elasticsearch.client.search({
      index: "parr_addresses",
      body: req.body
    });
    res.json({ response: response.hits });
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
    const response = await db.elasticsearch.client.search(query);
    res.json({ response: response.hits });
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

  return api;
};
