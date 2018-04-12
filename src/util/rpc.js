export const sendBatch = (web3Provider, requests) => {
  return new Promise((resolve, reject) => {
    if (!web3Provider) {
      return reject(new Error("Please provide a valid web3 provider"));
    }

    const payload = requests.map((request, index) => {
      return {
        jsonrpc: "2.0",
        id: index + 1,
        method: request.method,
        params: request.params || []
      };
    });

    web3Provider.sendAsync(payload, (error, results) => {
      if (error) reject(error);

      if (!Array.isArray(results)) {
        reject(new Error("Invalid response from web3"));
      }

      results = results || [];
      results = requests.map((request, index) => {
        return results[index] || {};
      });

      resolve(results);
    });
  });
};
