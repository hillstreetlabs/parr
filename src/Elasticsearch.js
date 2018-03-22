import elasticsearch from "elasticsearch";

export default class Elasticsearch {
  constructor() {
    this.esClient = new elasticsearch.Client({
      host: "127.0.0.1:9200",
      log: "error"
    });
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

    this.esClient
      .bulk({ body: bulkBody })
      .then(response => {
        let errorCount = 0;
        response.items.forEach(item => {
          if (item.index && item.index.error) {
            console.log(++errorCount, item.index.error);
          }
        });
        console.log(
          `Successfully indexed ${data.length - errorCount} out of ${
            data.length
          } items`
        );
      })
      .catch(console.err);
  }

  indices() {
    return this.esClient.cat
      .indices({ v: true })
      .then(console.log)
      .catch(err => console.error(`Error connecting to the es client: ${err}`));
  }
}
