import response from '../util/response';
import config from '../config';
import DB from '../util/postgres';
import Cache from '../util/cache';
import { createLogger, format, transports } from 'winston';
// const = require('winston');


const getUserFromCache = (cache: any, api_key: string) => {
    const keys = cache.api_keys.filter((e: any) => e.api_key === api_key);
    if (!keys || keys.length < 1) {
        throw new Error("Your key does not exist. If it was just created, please try again after a short wait.");
    }
    return keys[0];
}


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

    // console.log(pathName);

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

        const api_key = authorization.length > 10 ? authorization.substring(7) : null;
        if (!api_key) {
            throw new Error("Unauthorized: api key required.");
        }
        if (api_key === config.admin_api_key) {
            ctx.user = {
                id: -1,
                api_key: config.admin_api_key,
                name: "amdin",
                month_fee: '0',
                month_quota: '1',
                updated_at: new Date(),
                role: "admin"
            };
        } else if (ctx.cache) {
            ctx.user = getUserFromCache(ctx.cache, api_key);
        } else {
            throw new Error("Unauthorized: api key error.");
        }

        // console.log(ctx.user);



        // else if (ctx.cache) {
        //     //auth data from cache.
        //     const keys = ctx.cache.api_keys.filter((e: any) => e.api_key === api_key);
        //     if (!keys || keys.length < 1) {
        //         throw new Error("Unauthorized 0: api key error");
        //     }
        //     ctx.user = keys[0];
        // } else if (ctx.db) {
        //     //TODO: refactor this to your cache service if too many accesses.
        //     const key = await ctx.db.loadByKV("eiai_key", "api_key", api_key);

        //     if (!key) {
        //         throw new Error("Unauthorized 1: api key error");
        //     }
        //     ctx.user = key;
        // } else {
        //     throw new Error("Unauthorized 2: api key error");
        // }

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
    ctx.res.on('close', () => {
        // To ensure the response is properly ended.
        if (!ctx.res.finished) {
            ctx.res.end();
        }
    });

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

    // if (config.debugMode) {
    logger.level = 'silly';
    logger.add(new transports.Console({
        format: format.splat(),
    }));
    // }
    ctx.logger = logger;
    await next();
}


const dataCacheHandler = async (ctx: any, next: any) => {
    if (config.pgsql.host && config.pgsql.database) {
        ctx.cache = {
            models: Cache.models,
            api_keys: Cache.api_keys,
            connectors: Cache.connectors
        }
    }
    if (config.performanceMode) {
        ctx.performanceMode = true;
    } else {
        ctx.performanceMode = false;
    }
    await next();
}

export { errorHandler, authHandler, databaseHandler, loggerHandler, dataCacheHandler };