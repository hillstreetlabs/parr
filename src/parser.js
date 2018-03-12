export default class Parser {
  decodeIntegerField(hex) {
    const res = hex.split("0x")[1];
    return parseInt(result, 16);
  }

  decodeTimeField(field) {
    const seconds = this.decodeIntegerField(field);
    let time = new Date();
    time.setSeconds(seconds);
    return time;
  }
}
