import dotenv from "dotenv";
dotenv.config();
// Load-bearing order: util/self reads process.env at import, so it must stay below
// dotenv.config(). This holds because the emit is CommonJS; do not hoist or go ESM blindly.
import { listenHost, listenPort } from "./util/self";

import Koa from "koa";
import { koaBody as bodyParser } from "koa-body";
import cors from "@koa/cors";
import {
  authHandler,
  errorHandler,
  databaseHandler,
  loggerHandler,
  dataCacheHandler,
} from "./middleware/handlers";
import autoLoginHandler from "./middleware/portal_for_brclient";
import { router } from "./routes";
import serve from "koa-static-server";
import config from "./config";
import path from "path";
const fs = require("fs");
import { version } from "../package.json";
import { startUp } from "./util/warmup";
import { managerStaticHandler } from "./middleware/manager_static";
import { ccStaticHandler } from "./middleware/claude_code_web_static";
import { ccBodyLimit } from "./middleware/claude_code_web_body";
import { loadCcConfig } from "./claude_code_web/config";

const app = new Koa();

// app.on("error", (err, ctx) => {
//     console.error('server error', err, ctx);
// });

// disable UI for the static files
if (!config.disableUI) {
  const staticDir = path.resolve(__dirname, "../frontend");
  app.use(managerStaticHandler(staticDir));

  app.use(
    ccStaticHandler({
      staticDir: path.resolve(__dirname, "../cc"),
      isEnabled: async () => (await loadCcConfig()) !== null,
    }),
  );

  app.use(
    serve({
      rootDir: "./brclient",
      rootPath: "/brclient",
      index: "index.html",
      maxage: 1000 * 60 * 60 * 24 * 30,
    }),
  );
}

app.use(loggerHandler);

app.use(errorHandler);

// /cc/api/* gets its own 8 MiB cap (ccBodyLimit); every other route keeps these limits.
app.use(
  ccBodyLimit(
    bodyParser({
      multipart: true,
      encoding: "utf-8",
      formLimit: "100mb",
      jsonLimit: "100mb",
    }),
  ),
);

app.use(cors());

app.use(databaseHandler);

app.use(dataCacheHandler);

app.use(authHandler);

app.use(router.routes());

app.use(autoLoginHandler);

const onListening = () => {
  console.log(`🚀 BRConnector is running on http://${listenHost ?? '0.0.0.0'}:${listenPort}/`);
  console.log(`📖 Version ${version}`);
  if (config.performanceMode) {
    console.log(`Performance mode is ${config.performanceMode}.`);
  }
  if (config.debugMode) {
    console.log(`Debug mode is ${config.debugMode}.`);
  }
  if (config.pgsql.debugMode) {
    console.log(`Sql mode is on.`);
  }
};

(async () => {
  const result = await startUp();
  console.log(
    result === "warm"
      ? "Cache is warm."
      : result === "no-database"
        ? "No database configured, running without a cache."
        : "Cache is cold, requests may miss until it loads.",
  );
  // No host when the platform supplied none: Node then binds dual-stack (`::`, IPv4 and IPv6).
  listenHost === undefined
    ? app.listen(listenPort, onListening)
    : app.listen(listenPort, listenHost, onListening);
})();
