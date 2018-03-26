import Eth from "ethjs";
import ES from "./lib/ES";
import Etherscan from "etherscan-api";

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

  const latestBlock = (await web3.blockNumber()).toNumber();

  return { web3, elasticsearch, etherscan, latestBlock };
};
