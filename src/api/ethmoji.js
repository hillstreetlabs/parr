import { version } from "../../package.json";
import Eth from "ethjs";
import { Router } from "express";
import { Ethmoji } from "ethmoji-contracts";
import Etherscan from "etherscan-api";

export default ({ config, db }) => {
  let api = Router();

  const ethmoji = db.web3
    .contract(Ethmoji.abi)
    .at("0xa6d954d08877f8ce1224f6bfb83484c7d3abf8e9");
  const decoder = Eth.abi.logDecoder(ethmoji.abi);

  api.use("/:transactionId", async (req, res) => {
    const tx = await db.web3.getTransactionReceipt(req.params.transactionId);
    const logs = decoder(tx.logs);
    const internals = await db.etherscan.account.txlistinternal(
      req.params.transactionId
    );
    res.json({ tx, logs, internals });
  });

  return api;
};
