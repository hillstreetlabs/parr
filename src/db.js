import HttpProvider from "ethjs-provider-http";
import Eth from "ethjs-query";
import EthRPC from "ethjs-rpc";
import ES from "./lib/ES";
import Etherscan from "etherscan-api";
import Knex from "knex";
import knexConfig from "../knexfile";

// Returns an object with references to various databases
export default async () => {
  // const web3Provider = new HttpProvider(
  //   `https://${process.env.INFURA_NETWORK}.infura.io/${process.env.INFURA_KEY}`
  // );

  const web3Provider = new HttpProvider(process.env.PARITY_URL);

  const web3 = new Eth(web3Provider);

  const elasticsearch = new ES();

  const etherscan = Etherscan.init(process.env.ETHERSCAN_KEY);

  const pg = Knex(knexConfig[process.env.NODE_ENV || "development"]);

  console.log("Started databases");

  return { web3, web3Provider, elasticsearch, etherscan, pg };
};
