import { BlockAndLogStreamer } from "ethereumjs-blockstream";
import "isomorphic-fetch";

const gettersWithWeb3 = nodeEndpoint => ({
  getBlockByHash: async hash => {
    const res = await fetch(nodeEndpoint, {
      method: "POST",
      headers: new Headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getBlockByHash",
        params: [hash, true]
      })
    });
    return res.json();
  },
  getLogs: async filterOptions => {
    const res = await fetch(nodeEndpoint, {
      method: "POST",
      headers: new Headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getLogs",
        params: [filterOptions]
      })
    });
    return res.json();
  },
  getLatestBlock: async () => {
    const res = await fetch(nodeEndpoint, {
      method: "POST",
      headers: new Headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getBlockByNumber",
        params: ["latest", true]
      })
    });
    return res.json();
  }
});

export default gettersWithWeb3;
