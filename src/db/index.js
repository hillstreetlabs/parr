import HttpProvider from "ethjs-provider-http";
import Eth from "ethjs-query";
import ES from "./ES";
import Etherscan from "etherscan-api";
import Knex from "knex";
import Redis from "redis";
import knexConfig from "../../knexfile";
import { promisify } from "util";

const promisifyRedis = () => {
  const proto = Redis.RedisClient.prototype;
  Object.keys(proto).forEach(method => {
    if (typeof proto[method] === "function") {
      proto[method + "Async"] = promisify(proto[method]);
    }
  });
};

promisifyRedis();

// Returns an object with references to various databases
export default () => {
  const web3 = new Eth(new HttpProvider(process.env.JSON_RPC_URL));
  const elasticsearch = new ES();
  const redis = Redis.createClient();
  const etherscan = Etherscan.init(process.env.ETHERSCAN_KEY);
  const pg = Knex(knexConfig[process.env.NODE_ENV || "development"]);

  console.log("Started databases");

  return { web3, elasticsearch, etherscan, pg, redis };
};
