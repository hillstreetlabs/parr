require("dotenv").config();
require("es6-promise").polyfill();
require("isomorphic-fetch");

import http from "http";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import bodyParser from "body-parser";
import initDb from "./db";
import api from "./api";
import ethmoji from "./api/ethmoji";
import config from "./config.json";

let app = express();
app.server = http.createServer(app);

// logger
app.use(morgan("dev"));

// 3rd party middleware
app.use(
  cors({
    exposedHeaders: config.corsHeaders
  })
);

app.use(
  bodyParser.json({
    limit: config.bodyLimit
  })
);

// connect to db
initDb(db => {
  // api router
  app.use("/", api({ config, db }));

  app.use("/ethmoji", ethmoji({ config, db }));

  app.server.listen(process.env.PORT || config.port, () => {
    console.log(`Started on port ${app.server.address().port}`);
  });
});

export default app;
