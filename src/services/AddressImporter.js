import uuid from "uuid";
import EthContract from "ethjs-contract";
import Eth from "ethjs";
import upsert from "../util/upsert";
import withTimeout from "../util/withTimeout";
import implementsAbi from "../util/implementsAbi";
import ERC20 from "../../contracts/ERC20.json";
import ERC721 from "../../contracts/ERC721.json";
import ERC721Original from "../../contracts/ERC721-original.json";
import Crowdsale from "../../contracts/Crowdsale.json";
import NonFungibleToken from "../../contracts/NonFungibleToken.json";
import Metadata from "../../contracts/Metadata.json";

const BATCH_SIZE = 50;
const DELAY = 5000;

const getConstant = async (web3, address, abi, method) => {
  const contract = new EthContract(web3);
  const instance = contract(abi).at(address);
  try {
    const response = await withTimeout(instance[method](), 5000);
    return response[0];
  } catch (err) {
    return null;
  }
};

export const importAddress = async (db, address, customParams = {}) => {
  const bytecode = await withTimeout(db.web3.getCode(address), 5000);
  let data = {};
  if (implementsAbi(Metadata.abi, bytecode)) {
    data.name = await getConstant(db.web3, address, Metadata.abi, "name");
    data.symbol = await getConstant(db.web3, address, Metadata.abi, "symbol");
  }
  if (implementsAbi(Crowdsale.abi, bytecode)) {
    data.wallet = await getConstant(db.web3, address, Crowdsale.abi, "wallet");
    data.rate = (await getConstant(
      db.web3,
      address,
      Crowdsale.abi,
      "rate"
    )).toNumber();
    const weiRaised = await getConstant(
      db.web3,
      address,
      Crowdsale.abi,
      "weiRaised"
    );
    data.ethRaised = parseFloat(Eth.fromWei(weiRaised, "ether"));
    const tokenAddress = await getConstant(
      db.web3,
      address,
      Crowdsale.abi,
      "token"
    );
    if (tokenAddress) {
      const name = await getConstant(
        db.web3,
        tokenAddress,
        Metadata.abi,
        "name"
      );
      const symbol = await getConstant(
        db.web3,
        tokenAddress,
        Metadata.abi,
        "symbol"
      );
      data.token = { name, symbol, address: tokenAddress };
    }
  }
  const addressJson = {
    address,
    data,
    status: "downloaded",
    bytecode: bytecode,
    implements: {
      erc20: implementsAbi(ERC20.abi, bytecode),
      erc721: implementsAbi(ERC721.abi, bytecode),
      erc721_original: implementsAbi(ERC721Original.abi, bytecode),
      crowdsale: implementsAbi(Crowdsale.abi, bytecode),
      non_fungible_token: implementsAbi(NonFungibleToken.abi, bytecode)
    },
    ...customParams
  };
  const savedAddress = await upsert(
    db.pg,
    "addresses",
    addressJson,
    "(address)"
  );

  // Note: this code is optimized to prevent deadlocks
  // Update transactions by selecting their IDs and then setting status to downloaded
  const updatedTransactions = await db.pg
    .select()
    .from("transactions")
    .where({ status: "indexed" })
    .where(t =>
      t.where({ to_address: address }).orWhere({ from_address: address })
    )
    .returning("hash")
    .update({ status: "downloaded" });
  return savedAddress;
};

export default class AddressImporter {
  constructor(db) {
    this.db = db;
    this.timer;
    this.pid = `AddressImporter@${uuid.v4()}`;
  }

  async run() {
    let addresses = await this.getAddresses();
    if (addresses.length > 0) {
      await this.importAddresses(addresses);
      this.run();
    } else {
      console.log(`No stale addresses found, waiting ${DELAY}ms`);
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
        .where({ status: "stale", locked_by: null })
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

  async importAddresses(addresses) {
    try {
      await Promise.all(
        addresses.map(address =>
          importAddress(this.db, address.address, {
            locked_by: null,
            locked_at: null
          })
        )
      );
      console.log(`Imported ${addresses.length} addresses`);
      return true;
    } catch (err) {
      console.log(`Failed to import addresses`, err);
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
