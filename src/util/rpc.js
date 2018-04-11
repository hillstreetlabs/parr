// Check if JsonRPC response is valid
export const isValidResponse = response => {
  return Array.isArray(response)
    ? response.every(validateSingleMessage)
    : validateSingleMessage(response);

  function validateSingleMessage(message) {
    return (
      !!message &&
      !message.error &&
      message.jsonrpc === "2.0" &&
      typeof message.id === "number" &&
      message.result !== undefined
    );
  }
};

// Creates valid a batch of json payload objects
export const toBatchPayload = messages => {
  return messages.map((message, index) => {
    return {
      jsonrpc: "2.0",
      id: index + 1,
      method: message.method,
      params: message.params || []
    };
  });
};

// Create and send a batch of requests asynchronously
export const sendBatch = (provider, data, callback) => {
  if (!provider) {
    return callback(new Error("Please provide a valid web3 provider"));
  }

  const payload = toBatchPayload(data);

  console.log(payload);

  provider.sendAsync(payload, (error, results) => {
    console.log(results);

    if (error) return callback(error);

    if (!Array.isArray(results)) {
      return callback(new Error("Invalid response from web3"));
    }

    callback(error, results);
  });
};
