import uuid from "uuid";
import { addressJson } from "../util/esJson";

const BATCH_SIZE = 20;
const DELAY = 5000;

export default class AddressIndexer {
  constructor(db) {
    this.db = db;
    this.timer;
    this.pid = `AddressIndexer@${uuid.v4()}`;
  }

  async run() {
    let addresses = await this.getAddresses();
    if (addresses.length > 0) {
      await this.indexAddresses(addresses);
      this.run();
    } else {
      console.log(`No downloaded addresses found, waiting ${DELAY}ms`);
      this.timer = setTimeout(() => this.run(), DELAY);
    }
  }

  async exit() {
    console.log("Exiting...");
    clearTimeout(this.timer);
    const unlocked = await this.db.pg
      .select()
      .from("addresses")
      .where({ locked_by: this.pid })
      .returning("address")
      .update({
        locked_by: null,
        locked_at: null
      });
    console.log(`Unlocked ${unlocked.length} addresses`);
    process.exit();
  }

  getAddresses() {
    return this.db.pg.transaction(async trx => {
      const addresses = await trx
        .select()
        .from("addresses")
        .where({ status: "downloaded", locked_by: null })
        .limit(BATCH_SIZE);
      const lockedAddresses = await trx
        .select()
        .from("addresses")
        .whereIn("address", addresses.map(address => address.address))
        .returning("address")
        .update({
          locked_by: this.pid,
          locked_at: this.db.pg.fn.now()
        });
      return addresses;
    });
  }

  async indexAddresses(addresses) {
    const addressesJson = await Promise.all(
      addresses.map(address => this.fetchAddressJson(address))
    );
    const indexed = await this.db.elasticsearch.bulkIndex(
      "addresses",
      "address",
      addressesJson
    );
    const addressStrings = addresses.map(address => address.address);
    const updated = await this.db
      .pg("addresses")
      .whereIn("address", addressStrings)
      .update({
        status: "indexed",
        locked_by: null,
        locked_at: null,
        indexed_by: this.pid,
        indexed_at: this.db.pg.fn.now()
      });
    console.log(
      `Indexed ${addressStrings.length} addresses: ${addressStrings.join(", ")}`
    );
    return true;
  }

  async fetchAddressJson(address) {
    try {
      const fromSql = this.db
        .pg("transactions")
        .where("from_address", address.address);
      const toSql = this.db
        .pg("transactions")
        .where("to_address", address.address);
      const transactions = await fromSql.union(toSql);
      return addressJson(Object.assign(address, { transactions }));
    } catch (error) {
      console.log(`Failed to index address ${address.address}`, error);
      return this.unlockAddress(address.address);
    }
  }

  async unlockAddress(address) {
    const unlocked = await this.db
      .pg("addresses")
      .where("address", address)
      .returning("address")
      .update({ locked_by: null, locked_at: null });
    return unlocked;
  }
}
