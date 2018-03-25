import Eth from "ethjs";
import ES from "./lib/ES";
import Etherscan from "etherscan-api";

export default async callback => {
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

  callback({ web3, elasticsearch, etherscan, latestBlock });
};
