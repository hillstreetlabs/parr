<img width="35%" src="https://github.com/hillstreetlabs/parr-web/blob/master/src/assets/images/logo.png" />

---

Index the Ethereum blockchain to search more intelligently.

The name is inspired by the great
[Helen Parr](https://www.youtube.com/watch?v=9svuQXc-gBQ) (aka Elastigirl).

### Installation & Setup:

Before you start working on `parr`, you need to install
[Elasticsearch](https://www.elastic.co/) by following the instructions
[here](https://www.elastic.co/guide/en/elasticsearch/reference/current/_installation.html).

Once done, clone the repo and run `yarn` (or `npm install`) to install all the
dependencies and start Elasticsearch.

Update your `.env` file according to the following format:

```
// .env
INFURA_NETWORK=mainnet
INFURA_KEY=<Your Infura API Key>
ELASTICSEARCH_URL="localhost:9200"
ETHERSCAN_KEY=<Your Etherscan API Key>
```

Reset your Elasticsearch instance via the CLI:

```
node_modules/.bin/babel-node src/cli reset
```

Import a block via the CLI:

```
yarn cli blocks:add -B 5311100
```

To start your development environment, run:

```
yarn dev
```
