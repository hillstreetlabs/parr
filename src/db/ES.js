import Elasticsearch from "elasticsearch";

export const INDICES = [
  {
    name: "parr_blocks_transactions",
    settings: {
      analysis: {
        normalizer: {
          lowercase_normalizer: {
            type: "custom",
            filter: ["lowercase"]
          }
        }
      }
    },
    mappings: {
      _doc: {
        properties: {
          join_field: { type: "join", relations: { block: "transaction" } },
          type: { type: "keyword" },
          hash: { type: "keyword", normalizer: "lowercase_normalizer" },
          to: {
            type: "object",
            properties: {
              address: {
                type: "keyword",
                normalizer: "lowercase_normalizer"
              }
            }
          },
          from: {
            type: "object",
            properties: {
              address: {
                type: "keyword",
                normalizer: "lowercase_normalizer"
              }
            }
          },
          internal_transactions: {
            type: "nested",
            properties: {
              from: {
                type: "keyword",
                normalizer: "lowercase_normalizer"
              },
              to: {
                type: "keyword",
                normalizer: "lowercase_normalizer"
              },
              value: { type: "double" }
            }
          }
          value: { type: "double" },
          logs: {
            type: "nested",
            properties: {
              address: {
                type: "keyword",
                normalizer: "lowercase_normalizer"
              },
              block_hash: {
                type: "keyword",
                normalizer: "lowercase_normalizer"
              },
              transaction_hash: {
                type: "keyword",
                normalizer: "lowercase_normalizer"
              }
            }
          }
        }
      }
    }
  },
  {
    name: "parr_addresses",
    settings: {
      analysis: {
        analyzer: {
          bytecode_analyzer: {
            tokenizer: "bytecode_tokenizer"
          }
        },
        tokenizer: {
          bytecode_tokenizer: {
            type: "ngram",
            min_gram: 8,
            max_gram: 8,
            token_chars: ["letter", "digit"]
          }
        },
        normalizer: {
          lowercase_normalizer: {
            type: "custom",
            filter: ["lowercase"]
          }
        }
      }
    },
    mappings: {
      _doc: {
        properties: {
          join_field: {
            type: "join",
            relations: { address: ["to_transaction", "from_transaction"] }
          },
          type: { type: "keyword" },
          address: { type: "keyword", normalizer: "lowercase_normalizer" },
          value: { type: "double" },
          implements: { type: "object" },
          bytecode: { type: "text", analyzer: "bytecode_analyzer" }
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
        body: { settings: index.settings, mappings: index.mappings }
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

  async bulkIndex(index, data, params = {}) {
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
          _type: "_doc",
          _id: item.id,
          _routing: item.routing || undefined
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
