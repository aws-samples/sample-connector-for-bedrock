import dotenv from 'dotenv';
dotenv.config();

import Koa from "koa";
import { bodyParser } from "@koa/bodyparser"
import cors from "@koa/cors"
import { authHandler, errorHandler, databaseHandler, loggerHandler } from './middleware/handlers'
import { router } from "./routes";
import serve from "koa-static-server";
import config from './config';

import install from './install';

install();


const app = new Koa();

// disable auth for the statis files
if (!config.disableUI) {
    app.use(serve({
        rootDir: './public',
        rootPath: '/manager',
        index: 'index.html'
    }));
    app.use(serve({
        rootDir: './brclient',
        rootPath: '/brclient',
        index: 'index.html'
    }));
}

app.use(loggerHandler);

app.use(errorHandler);

app.use(bodyParser({
    encoding: "utf-8",
    formLimit: "100mb",
    jsonLimit: "100mb",
}));

app.use(cors());

app.use(databaseHandler);

app.use(authHandler);

app.use(router.routes());

const port = 8866;

app.listen(port, () => {
    const pJson = require("../package.json");
    console.log(`🚀 BRConnector is running on port http://0.0.0.0:${port}/`);
    console.log(`📖 Version ${pJson.version}`);
});