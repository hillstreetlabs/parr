import { version } from "../../package.json";
import { Router } from "express";

export default ({ config, db }) => {
  let api = Router();

  api.use("/accounts/:accountId/internal_transactions", async (req, res) => {
    const internals = await db.etherscan.account.txlistinternal(
      null,
      req.params.accountId,
      0
    );
    res.json({ address: req.params.accountId, internals: internals.result });
  });

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

  api.use("/blocks", async (req, res) => {
    const blocks = await db.pg.select().table("blocks");
    res.json({ blocks });
  });

  api.use("/transactions/:transactionId", async (req, res) => {
    const receipt = await db.web3.getTransactionReceipt(
      req.params.transactionId
    );
    const tx = await db.web3.getTransactionByHash(req.params.transactionId);
    const internals = await db.etherscan.account.txlistinternal(
      req.params.transactionId
    );
    res.json({ transaction: tx, receipt, internals });
  });

  api.post("/search", async (req, res) => {
    const query = await db.elasticsearch.client.search(req.params);
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
