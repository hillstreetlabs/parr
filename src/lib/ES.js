import Elasticsearch from "elasticsearch";

const INDICES = ["blocks", "transactions", "logs", "accounts"];

export default class ES {
  constructor() {
    this.client = new Elasticsearch.Client({
      host: process.env.ELASTICSEARCH_URL,
      log: "error"
    });
  }

  indices() {
    return this.client.cat
      .indices({ v: true })
      .then(console.log)
      .catch(err => console.error(`Error connecting to the es client: ${err}`));
  }

  resetIndices() {
    INDICES.map(async indexName => {
      const indexExists = await this.client.indices.exists({
        index: indexName
      });
      if (indexExists) await this.client.indices.delete({ index: indexName });
      this.client.indices.create({ index: indexName });
    });
    return true;
  }

  count(index) {
    this.client
      .count({
        index: index
      })
      .then(response => {
        console.log(`There are ${response.count} documents in index ${index}`);
      });
  }

  async bulkIndex(index, type, data) {
    if (!await this.client.indices.exists({ index: index })) {
      throw `ES index ${index} does not exist`;
    }

    if (data.length === 0) return true;

    let bulkBody = [];

    data.forEach(item => {
      // Select the document to index
      bulkBody.push({
        index: {
          _index: index,
          _type: type,
          _id: item.id
        }
      });

      // Index the data
      bulkBody.push(item);
    });

    return this.client
      .bulk({ body: bulkBody })
      .then(response => {
        let errorCount = 0;
        response.items.forEach(item => {
          if (item.index && item.index.error) {
            console.log(++errorCount, item.index.error);
          }
        });
      })
      .catch(console.err);
  }
}
