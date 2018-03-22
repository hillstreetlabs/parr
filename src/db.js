import Eth from "ethjs";
import Elasticsearch from "elasticsearch";

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
  callback({ web3, elasticsearch });
};
