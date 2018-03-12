const { BlockAndLogStreamer } = require("ethereumjs-blockstream");
require("isomorphic-fetch");

console.log(BlockAndLogStreamer);

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

const getters = gettersWithWeb3("http://localhost:8545");
const streamer = new BlockAndLogStreamer(
  getters.getBlockByHash,
  getters.getLogs,
  {
    blockRetention: 100
  }
);

console.log("HERE");

streamer.subscribeToOnBlockAdded(block => {
  // console.log("BLOCK              ", block);
});

streamer.subscribeToOnLogAdded(log => {
  console.log("LOGS             ", log);
});

console.log("STREAMER          ", streamer);

setInterval(async () => {
  console.log("REPEAT");
  streamer.reconcileNewBlock(await getters.getLatestBlock());
}, 1000);

// this.onBlockAddedSubscriptionToken = this.streamer.subscribeToOnBlockAdded(this.onBlockAdd)
// this.onBlockRemovedSubscriptionToken = this.streamer.subscribeToOnBlockRemoved(this.onBlockInvalidated)
