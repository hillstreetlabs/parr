import { version } from "../../package.json";
import { Router } from "express";
import facets from "./facets";

export default ({ config, db }) => {
  let api = Router();

  // mount the facets resource
  api.use("/facets", facets({ config, db }));

  api.use("/accounts/:accountId", async (req, res) => {
    const balance = await db.web3.getBalance(req.params.accountId);
    res.json({ address: req.params.accountId, balance });
  });

  api.use("/accounts", async (req, res) => {
    const accounts = await db.web3.accounts();
    res.json({ accounts });
  });

  api.use("/blocks/:blockId", async (req, res) => {
    const block = await db.web3.getBlockByNumber(req.params.blockId, true);
    res.json({ block });
  });

  api.use("/transactions/:transactionId", async (req, res) => {
    const tx = await db.web3.getTransactionReceipt(req.params.transactionId);
    const internals = await db.etherscan.account.txlistinternal(
      req.params.transactionId
    );
    res.json({ tx, internals });
  });

  api.post("/search", async (req, res) => {
    const query = await db.elasticsearch.search(req.params);
    res.json({ query });
  });

  // perhaps expose some API metadata at the root
  api.get("/", (req, res) => {
    const { elasticsearch, web3 } = db;
    const provider = web3.currentProvider;
    res.json({ version, provider });
  });

  return api;
};
