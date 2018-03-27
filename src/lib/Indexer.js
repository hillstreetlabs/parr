import { action, computed, observable } from "mobx";

export default class Indexer {
  @observable isRunning = false;
  @observable totalImported = 0;

  constructor(db, options) {
    this.db = db;
    if (options.last) {
      this.fromBlock = db.latestBlock - options.last + 1;
      this.toBlock = db.latestBlock;
    } else if (options.block) {
      this.fromBlock = this.toBlock = options.block;
    } else {
      this.fromBlock = options.from || 1;
      this.toBlock = options.to || db.latestBlock;
    }
    if (this.toBlock < this.fromBlock)
      throw "toBlock must be greater than or equal to fromBlock";
  }

  @computed
  get importedPerc() {
    if (this.total == 0) return 0;
    return this.totalImported / this.total;
  }

  async index(imported) {
    await this.db.elasticsearch.bulkIndex("blocks", "block", imported);
  }

  get total() {
    return this.toBlock - this.fromBlock + 1;
  }
}
