import Elasticsearch from "elasticsearch";

export const indices = ["blocks", "transactions", "logs", "accounts"];

export default class ES {
  constructor() {
    this.client = new Elasticsearch.Client({
      host: process.env.ELASTICSEARCH_URL,
      log: "error"
    });
  }

  resetIndices() {
    indices.map(async indexName => {
      const indexExists = await this.client.indices.exists({
        index: indexName
      });
      if (indexExists) await this.client.indices.delete({ index: indexName });
      this.client.indices.create({ index: indexName });
    });
    return true;
  }

  bulkIndex(index, type, data) {
    let bulkBody = [];

    data.forEach(item => {
      bulkBody.push({
        index: {
          _index: index,
          _type: type,
          _id: item.id
        }
      });

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

  indices() {
    return this.client.cat
      .indices({ v: true })
      .then(console.log)
      .catch(err => console.error(`Error connecting to the es client: ${err}`));
  }
}
