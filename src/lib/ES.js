import Elasticsearch from "elasticsearch";

const INDICES = [
  "blocks",
  "transactions",
  "logs",
  "addresses",
  "internal_transactions"
];

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

  stats() {
    return this.client.indices.stats();
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

  async count(index) {
    const response = await this.client.count({
      index: index
    });

    console.log(`There are ${response.count} documents in the ${index} index`);
  }

  async bulkIndex(index, type, data) {
    if (!await this.client.indices.exists({ index: index })) {
      throw `ES index ${index} does not exist`;
    }

    const toIndex = Array.isArray(data) ? data : [data];

    if (toIndex.length === 0) return true;

    let bulkBody = [];

    toIndex.forEach(item => {
      // Select the document to index
      bulkBody.push({
        update: {
          _index: index,
          _type: type,
          _id: item.id
        }
      });

      // Index the item
      // Item format is { title: "foo", hash: "0x123ABC" }
      bulkBody.push({ doc: item, doc_as_upsert: true });
    });

    return this.client.bulk({ body: bulkBody }).then(response => {
      let errorCount = 0;
      response.items.forEach(item => {
        if (item.index && item.index.error) {
          console.log(++errorCount, item.index.error);
        }
      });
      return response;
    });
  }
}
