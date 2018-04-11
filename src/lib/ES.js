import Elasticsearch from "elasticsearch";

export const INDICES = [
  {
    name: "parr-blocks-transactions",
    mappings: {
      document: {
        properties: {
          join_field: {
            type: "join",
            relations: { block: "transaction" }
          },
          type: {
            type: "keyword"
          },
          hash: {
            type: "keyword"
          }
        }
      }
    }
  },
  {
    name: "parr-addresses",
    mappings: {
      document: {
        properties: {
          join_field: {
            type: "join",
            relations: { address: ["toTransaction", "fromTransaction"] }
          },
          type: {
            type: "keyword"
          }
        }
      }
    }
  }
];

export default class ES {
  constructor() {
    this.client = new Elasticsearch.Client({
      host: process.env.ELASTICSEARCH_URL,
      log: "error"
    });
  }

  stats() {
    return this.client.indices.stats();
  }

  reset() {
    INDICES.map(async index => {
      const indexExists = await this.client.indices.exists({
        index: index.name
      });
      if (indexExists) await this.client.indices.delete({ index: index.name });
      return this.client.indices.create({
        index: index.name,
        body: { mappings: index.mappings }
      });
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
