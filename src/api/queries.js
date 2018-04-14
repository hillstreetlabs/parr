import { Router } from "express";
import crypto from "crypto";

const sha1 = string =>
  crypto
    .createHash("sha1")
    .update(string, "utf8")
    .digest()
    .toString("hex");

const queryJson = query => ({
  query: query.query,
  hash: query.hash,
  api: query.api
});

export default ({ db }) => {
  let api = Router();

  // Create query
  api.post("/", async (req, res) => {
    const { api, query: queryString } = req.body;

    if (!queryString || !api) {
      return res.status(400).json({ error: "Query and API are required" });
    }

    if (!["blocks_transactions", "addresses", "implements_abi"].includes(api)) {
      return res.status(400).json({ error: "API is invalid" });
    }

    const hash = sha1(api + queryString);
    const insert = db
      .pg("queries")
      .insert({ query: queryString, hash, use_count: 1, api });
    const query = await db.pg
      .raw(
        `? ON CONFLICT (hash) DO UPDATE SET use_count = queries.use_count + 1 returning *`,
        insert
      )
      .get("rows")
      .get(0);

    res.json({ query: queryJson(query) });
  });

  api.get("/:hash", async (req, res) => {
    const hash = req.params.hash;
    let query = await db
      .pg("queries")
      .where({ hash })
      .first();
    if (query) res.json({ query: queryJson(query) });
    else res.status(404).send({ error: "Not found" });
  });

  return api;
};
