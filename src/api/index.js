import { version } from "../../package.json";
import { Router } from "express";

export default ({ config, db }) => {
  let api = Router();

  api.post("/blocks", async (req, res) => {
    const response = await db.elasticsearch.client.search({
      index: "parr_blocks_transactions",
      body: req.body
    });
    res.json({ response });
  });

  api.post("/addresses", async (req, res) => {
    const response = await db.elasticsearch.client.search({
      index: "parr_addresses",
      body: req.body
    });
    res.json({ response });
  });

  api.post("/all", async (req, res) => {
    const query = await db.elasticsearch.client.search(req.params);
    res.json({ query });
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
