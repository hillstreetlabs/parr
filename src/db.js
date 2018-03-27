import Eth from "ethjs";
import ES from "./lib/ES";
import Etherscan from "etherscan-api";
import Knex from "knex";
import knexConfig from "../knexfile";

// Returns an object with references to various databases
export default async () => {
  const web3 = new Eth(
    new Eth.HttpProvider(
      `https://${process.env.INFURA_NETWORK}.infura.io/${
        process.env.INFURA_KEY
      }`
    )
  );

  const elasticsearch = new ES();

  const etherscan = Etherscan.init(process.env.ETHERSCAN_KEY);

  const pg = Knex(knexConfig[process.env.NODE_ENV || "development"]);

  console.log("Started databases");

  return { web3, elasticsearch, etherscan, pg };
};
