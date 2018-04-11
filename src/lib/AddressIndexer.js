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
    await this.unlockAddresses();
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
    try {
      const addressesJson = addresses.map(address => addressJson(address));
      const indexed = await this.db.elasticsearch.bulkIndex(
        "parr_addresses",
        addressesJson
      );
      if (indexed.errors) throw JSON.stringify(indexed);
      const updated = await this.db
        .pg("addresses")
        .whereIn("address", addresses.map(address => address.address))
        .returning("address")
        .update({
          status: "indexed",
          locked_by: null,
          locked_at: null,
          indexed_by: this.pid,
          indexed_at: this.db.pg.fn.now()
        });
      console.log(`Indexed ${updated.length} addresses`);
      return true;
    } catch (err) {
      console.log(`Failed to index addresses`, err);
      return this.unlockAddresses();
    }
  }

  async unlockAddresses() {
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
  }
}
