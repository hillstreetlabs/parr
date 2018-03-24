import Eth from "ethjs";
import Elasticsearch from "elasticsearch";
import Etherscan from "etherscan-api";

export default callback => {
  const web3 = new Eth(
    new Eth.HttpProvider(
      `https://${process.env.INFURA_NETWORK}.infura.io/${
        process.env.INFURA_KEY
      }`
    )
  );

  const elasticsearch = new Elasticsearch.Client({
    host: process.env.ELASTICSEARCH_URL,
    log: "trace"
  });

  const etherscan = Etherscan.init(process.env.ETHERSCAN_KEY);

  callback({ web3, elasticsearch, etherscan });
};
