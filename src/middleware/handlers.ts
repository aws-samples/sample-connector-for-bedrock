import response from '../util/response';
import config from '../config';
import DB from '../util/postgres';
import { createLogger, format, transports } from 'winston';
// const = require('winston');


const authHandler = async (ctx: any, next: any) => {

    const pathName = ctx.path;
    if (pathName == "/") {
        ctx.body = "ok";
        return;
    }
    if (pathName.indexOf("/webui") >= 0) {
        await next();
        return;
    }
    if (pathName == "/favicon.ico") {
        ctx.body = "ok";
        return;
    }

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
    } else if (ctx.db) {
        //TODO: refactor this to your cache service if too many access.
        const key = await ctx.db.loadByKV("eiai_key", "api_key", api_key);

        if (!key) {
            throw new Error("Unauthorized: api key error");
        }
        ctx.user = {
            id: key.id,
            api_key: key.api_key,
            name: key.admin,
            role: key.role
        };
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
        ctx.db = await DB.build(config.pgsql);
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
            new transports.File({ filename: './logs/error.log', level: 'error' }),
            new transports.File({ filename: './logs/combined.log' }),
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

export { errorHandler, authHandler, databaseHandler, loggerHandler };