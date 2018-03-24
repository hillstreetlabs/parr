import { version } from "../../package.json";
import Eth from "ethjs";
import { Router } from "express";
import { Ethmoji } from "ethmoji-contracts";

export default ({ config, db }) => {
  let api = Router();

  const ethmoji = db.web3
    .contract(Ethmoji.abi)
    .at("0xa6d954d08877f8ce1224f6bfb83484c7d3abf8e9");
  const decoder = Eth.abi.logDecoder(ethmoji.abi);

  api.use("/:transactionId", async (req, res) => {
    const tx = await db.web3.getTransactionReceipt(req.params.transactionId);
    const logs = decoder(tx.logs);
    const response = await fetch(
      `https://api.etherscan.io/api?module=account&action=txlistinternal&txhash=${
        req.params.transactionId
      }&apikey=${process.env.ETHERSCAN_KEY}`
    );
    const internals = await response.json();
    res.json({ tx, logs, internals });
  });

  return api;
};
