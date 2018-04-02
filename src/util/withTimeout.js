export default (promise, timeout) => {
  return new Promise((resolve, reject) => {
    let timer = setTimeout(() => reject(), timeout);
    promise.then((...args) => {
      if (timer) {
        clearTimeout(timer);
        resolve(...args);
      }
    });
    promise.catch((...args) => {
      if (timer) {
        clearTimeout(timer);
        reject(...args);
      }
    });
  });
};
