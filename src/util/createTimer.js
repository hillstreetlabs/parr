// Usage:
//  this.timer = createTimer();
//  const timer = this.timer.time('Some thing');
//  ...
//  timer.stop();
export default function createTimer() {
  let times = {};
  return {
    time(key) {
      if (times[key] === undefined) times[key] = 0;
      const start = new Date().getTime();
      return {
        stop: () => {
          times[key] += new Date().getTime() - start;
        }
      };
    },
    get() {
      return times;
    }
  };
}
