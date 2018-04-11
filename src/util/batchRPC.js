import { sendBatch, isValidResponse } from "./rpc";

export default class BatchRPC {
  constructor(web3) {
    this.requests = [];
    this.web3 = web3;
  }

  add(request) {
    this.requests.push(request);
  }

  execute() {
    const requests = this.requests;
    sendBatch(this.web3, requests, (error, results) => {
      console.log("RESULTS", results);
      results = results || [];
      requests
        .map((request, index) => {
          return results[index] || {};
        })
        .forEach((result, index) => {
          if (requests[index].callback) {
            if (!isValidResponse(result)) {
              return requests[index].callback(
                new Error("Invalid response from web3")
              );
            }

            console.log(requests[index]);

            requests[index].callback(
              null,
              requests[index].format
                ? requests[index].format(result.result)
                : result.result
            );
          }
        });
    });
  }
}
