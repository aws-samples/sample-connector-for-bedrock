import dotenv from "dotenv";
dotenv.config();

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
import install from "./install";
import { version } from "../package.json";
install();

import cache from "./util/cache";

cache.run();

const app = new Koa();

// app.on("error", (err, ctx) => {
//     console.error('server error', err, ctx);
// });

// disable UI for the static files
if (!config.disableUI) {
  const staticDir = path.resolve(__dirname, "../frontend");
  app.use(async (ctx, next) => {
    if (ctx.path.startsWith("/manager") && ctx.method === "GET") {
      const relativePath = ctx.path.slice("/manager".length);
      const filePath =
        relativePath === "" || relativePath === "/"
          ? path.join(staticDir, "index.html")
          : path.join(staticDir, relativePath);

      if (
        relativePath !== "" &&
        relativePath !== "/" &&
        fs.existsSync(filePath) &&
        fs.statSync(filePath).isFile()
      ) {
        ctx.type =
          require("mime-types").lookup(filePath) || "application/octet-stream";
        ctx.body = fs.createReadStream(filePath);
        return;
      }

      if (!/\.\w+$/.test(ctx.path)) {
        ctx.type = "text/html; charset=utf-8";
        ctx.body = fs.readFileSync(path.join(staticDir, "index.html"));
        return;
      }
    }
    await next();
  });

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

app.use(
  bodyParser({
    multipart: true,
    encoding: "utf-8",
    formLimit: "100mb",
    jsonLimit: "100mb",
  }),
);

app.use(cors());

app.use(databaseHandler);

app.use(dataCacheHandler);

app.use(authHandler);

app.use(router.routes());

app.use(autoLoginHandler);

const port = 8866;

app.listen(port, () => {
  console.log(`🚀 BRConnector is running on port http://0.0.0.0:${port}/`);
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
});
