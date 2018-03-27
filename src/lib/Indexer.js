import { action, computed, observable } from "mobx";

export default class Indexer {
  @observable totalIndexed = 0;

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
  get indexedPerc() {
    if (this.total == 0) return 0;
    return this.totalIndexed / this.total;
  }

  get total() {
    return this.toBlock - this.fromBlock + 1;
  }

  get blockRange() {
    return Array(this.toBlock - this.fromBlock + 1)
      .fill()
      .map((_, idx) => this.fromBlock + idx);
  }

  @action
  async index() {
    const response = await this.db.pg
      .from("blocks")
      .whereIn("number", this.blockRange);

    if (response.length !== this.total)
      throw "Couldn't find all the blocks in the pg";

    const toIndex = response.map(object => {
      return object.data;
    });

    const result = await this.db.elasticsearch.bulkIndex(
      "blocks",
      "block",
      toIndex
    );

    this.totalIndexed = response.length;
  }
}
