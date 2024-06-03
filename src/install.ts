import { Client } from 'pg';
import fs from 'fs';
import config from './config';

export default async function () {
    if (!config.pgsql.host || !config.pgsql.database) {
        console.error("❌ Postgres not configured, skip installation.");
        console.log("💡 You can use any fake api key to access this proxy's llm api.")
        return;
    }

    const client = new Client({
        host: config.pgsql.host,
        port: config.pgsql.port ? ~~config.pgsql.port : 5432,
        database: config.pgsql.database,
        user: config.pgsql.user,
        password: config.pgsql.password,
    })
    try {
        await client.connect();
    } catch (err: any) {
        console.error("❌ Postgres connection error: ", err.message);
        return;
    }
    console.log("Postgres connected.");
    console.log("[init] Check database status...");
    const sql = "SELECT to_regclass('public.eiai_key')";
    const res = await client.query(sql);
    const regClass = res.rows[0]["to_regclass"];
    if (regClass) {
        console.log("[init] Tables created, skip installation.");
    } else {
        console.log("[init] Tables not exists, installing...");
        const sqlCreate = fs.readFileSync("./src/scripts/create.sql", "utf8");
        await client.query(sqlCreate);
        console.log("[init] Created successfully.");
    }


    // 0.0.5 install...
    console.log("[v0.0.5] Check database status...");
    const sql_0_0_5 = "SELECT to_regclass('public.eiai_group')";
    const res_0_0_5 = await client.query(sql_0_0_5);
    const regClass_0_0_5 = res_0_0_5.rows[0]["to_regclass"];
    if (regClass_0_0_5) {
        console.log("[v0.0.5] Tables created, skip installation.");
    } else {
        console.log("[v0.0.5] Tables not exists, installing...");
        const sqlCreate_0_0_5 = fs.readFileSync("./src/scripts/patch-0.0.5.sql", "utf8");
        await client.query(sqlCreate_0_0_5);
        console.log("[v0.0.5] Created  successfully.");
    }

    await client.end();
    const adminKey = config.admin_api_key;
    if (!adminKey) {
        console.error("❌ Admin API key not set, please set 'ADMIN_API_KEY' in env.");
    }
}