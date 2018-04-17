import uuid from "uuid";
import { addressJson } from "../util/esJson";

const BATCH_SIZE = 200;
const DELAY = 5000;

export default class AddressIndexer {
  constructor(db) {
    this.db = db;
    this.timer;
    this.pid = `AddressIndexer@${uuid.v4()}`;
  }

  async run() {
    this.addresses = await this.getAddresses();
    if (this.addresses.length > 0) {
      await this.indexAddresses();
      this.run();
    } else {
      console.log(`No addresses found to index, waiting ${DELAY}ms`);
      this.timer = setTimeout(() => this.run(), DELAY);
    }
  }

  async exit() {
    console.log("Exiting...");
    clearTimeout(this.timer);
    await this.unlockAddresses();
    process.exit();
  }

  async getAddresses() {
    const addressHashes = await this.db.redis.spopAsync(
      "addresses:to_index",
      BATCH_SIZE
    );
    return this.db.pg.from("addresses").whereIn("address", addressHashes);
  }

  async indexAddresses() {
    try {
      const addressesJson = this.addresses.map(address => addressJson(address));
      const indexed = await this.db.elasticsearch.bulkIndex(
        "parr_addresses",
        addressesJson
      );
      if (indexed.errors) throw new Error(JSON.stringify(indexed));
      console.log(`Indexed ${this.addresses.length} addresses`);
      return true;
    } catch (err) {
      console.log(`Failed to index addresses`, err);
      return this.unlockAddresses();
    }
  }

  async unlockAddresses() {
    if (this.addresses.length > 0)
      await this.db.redis.saddAsync(
        "addresses:to_index",
        this.addresses.map(addr => addr.address)
      );
    console.log(`Unlocked ${this.addresses.length} addresses`);
  }
}
