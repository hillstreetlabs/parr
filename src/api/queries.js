import { Router } from "express";
import crypto from "crypto";

const sha1 = string =>
  crypto
    .createHash("sha1")
    .update(string, "utf8")
    .digest()
    .toString("hex");

const queryJson = query => ({
  query: {
    query: query.query,
    hash: query.hash,
    api: query.api
  }
});

export default ({ db }) => {
  let api = Router();

  // Create query
  api.post("/", async (req, res) => {
    const queryString = req.body.query;
    const api = req.body.api;

    if (!queryString || !api) {
      return res.status(400).json({ error: "Query and API are required" });
    }

    if (!["blocks_transactions", "addresses", "implements_abi"].includes(api)) {
      return res.status(400).json({ error: "API is invalid" });
    }

    const hash = sha1(api + queryString);
    let query = await db
      .pg("queries")
      .select("*")
      .where({ hash })
      .first();
    if (query) {
      await db
        .pg("queries")
        .where({ hash })
        .update({ use_count: query.use_count + 1 });
    } else {
      query = {
        query: queryString,
        hash,
        use_count: 1,
        api
      };
      await db.pg("queries").insert(query);
    }

    res.json(queryJson(query));
  });

  api.get("/:hash", async (req, res) => {
    const hash = req.params.hash;
    let query = await db
      .pg("queries")
      .select("*")
      .where({ hash })
      .first();
    if (query) res.json(queryJson(query));
    else res.status(404).send({ error: "Not found" });
  });

  return api;
};