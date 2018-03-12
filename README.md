# parr :mag:

Index the ~entire~ Ethereum blockchain to search more intelligently.

The name is inspired by the great [Helen Parr](https://www.youtube.com/watch?v=9svuQXc-gBQ) (aka Elastigirl).

### Installation & Setup:

Before you start working on `parr`, you need to install [Elasticsearch](https://www.elastic.co/) by following the instructions [here](https://www.elastic.co/guide/en/elasticsearch/reference/current/_installation.html).

Once done, clone the repo and run `yarn` (or `npm install`) to install all the dependencies and start Elasticsearch.

### TODO

* [x] Read blocks and transactions from the blockchain
* [x] Index data on Elasticsearch
* [x] Make sense of block and transaction data
* [ ] Read logs from the blockchain
* [ ] Hook everything up
