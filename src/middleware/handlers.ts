import response from '../util/response';
import config from '../config';
import DB from '../util/postgres';
import Cache from '../util/cache';
import { createLogger, format, transports } from 'winston';
// const = require('winston');


const authHandler = async (ctx: any, next: any) => {

    let pathName = ctx.path;
    if (pathName == "/") {
        ctx.body = "ok";
        return;
    }
    if (pathName == "/favicon.ico") {
        ctx.body = "ok";
        return;
    }
    pathName = pathName.toLowerCase();


    // skip cognito
    // if (pathName.indexOf("/aws_cognito_configuration") === 0) {
    //     ctx.status = 404;
    //     ctx.body = "Not Found";
    //     return;
    // }


    // if (pathName.indexOf("/brclient") === 0) {
    //     await next();
    //     return;
    // }
    // if (pathName.indexOf("/manager") === 0) {
    //     await next();
    //     return;
    // }
    // if (pathName.indexOf("/im") === 0) {
    //     await next();
    //     return;
    // }

    if (pathName.indexOf("/admin") === 0
        || pathName.indexOf("/user") === 0
        || pathName.indexOf("/v1") === 0
    ) {
        const authorization = ctx.header.authorization || "";
        const api_key = authorization.length > 20 ? authorization.substring(7) : null;
        if (!api_key) {
            throw new Error("Unauthorized: api key required");
        }
        if (api_key === config.admin_api_key) {
            ctx.user = {
                id: -1,
                api_key: config.admin_api_key,
                name: "amdin",
                role: "admin"
            };
        } else if (ctx.cache) {
            //auth data from cache.
            const keys = ctx.cache.api_keys.filter((e: any) => e.api_key === api_key);
            // console.log(keys);
            if (!keys || keys.length < 1) {
                throw new Error("Unauthorized: api key error");
            }
        } else if (ctx.db) {
            //TODO: refactor this to your cache service if too many accesses.
            const key = await ctx.db.loadByKV("eiai_key", "api_key", api_key);

            if (!key) {
                throw new Error("Unauthorized: api key error");
            }
            ctx.user = key;
        } else {
            // Anonymous access...
            ctx.logger.info("Fake api key, anonymous access...");
            ctx.user = null;
        }

        if (pathName.indexOf("/admin") >= 0) {
            if (!ctx.user || ctx.user.role !== "admin") {
                throw new Error("Unauthorized: you are not an admin role.")
            }
        }

        if (pathName.indexOf("/user") >= 0) {
            if (!ctx.user) {
                throw new Error("Unauthorized: you are not a member.")
            }
        }

    }
    await next();

};

const errorHandler = async (ctx: any, next: any) => {
    try {
        await next();
    } catch (ex: any) {
        ctx.logger.error(ex.message);
        if (config.debugMode) {
            console.log(ex);
        }
        ctx.body = response.error(ex.message);
    }
};


const databaseHandler = async (ctx: any, next: any) => {
    if (config.pgsql.host && config.pgsql.database) {
        ctx.db = DB.build(config.pgsql);
    }
    await next();
};

const loggerHandler = async (ctx: any, next: any) => {

    const logger = createLogger({
        level: 'info',
        format: format.combine(
            format.timestamp(),
            format.prettyPrint(),
        ),
        defaultMeta: { service: 'brconnector', path: ctx.path },
        transports: [
            new transports.File({ filename: '/tmp/error.log', level: 'error' }),
            new transports.File({ filename: '/tmp/combined.log' }),
        ],
    });

    if (config.debugMode) {
        logger.level = 'silly';
        logger.add(new transports.Console({
            format: format.splat(),
        }));
    }
    ctx.logger = logger;
    await next();
}


const dataCacheHandler = async (ctx: any, next: any) => {
    if (config.performanceMode) {
        ctx.cache = {
            models: Cache.models,
            api_keys: Cache.api_keys,
            connectors: Cache.connectors
        }
    }
    await next();
}

export { errorHandler, authHandler, databaseHandler, loggerHandler, dataCacheHandler };