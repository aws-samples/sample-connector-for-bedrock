import { Client } from 'pg';
import fs from 'fs';
import config from './config';
import path from 'path';

const MIGRATIONS_DIR = path.join(__dirname, "./scripts/migrations");

// Arbitrary fixed key: serializes install and runMigrations across instances that start at the same time.
const MIGRATION_LOCK_ID = 727463001;

/**
 * Applies each `*.sql` in `dir` not yet recorded in eiai_migration, in lexical filename order. A file
 * and its ledger row commit together; on failure the file is rolled back, logged, and later files
 * wait for the next startup. Never throws. Each file runs inside the runner's BEGIN/COMMIT, so it
 * must not contain transaction control or CONCURRENTLY; names start with a date (YYYY-MM-DD) so
 * lexical order is chronological.
 */
export async function runMigrations(client: Pick<Client, "query">, dir = MIGRATIONS_DIR): Promise<void> {
    console.log("[migration] Check database status...");
    try {
        // Session-level lock: a second instance waits here, then sees the first one's ledger rows.
        await client.query(`select pg_advisory_lock(${MIGRATION_LOCK_ID})`);
    } catch (err: any) {
        console.error("❌ [migration] could not take the migration lock, skipped: ", err.message);
        return;
    }
    try {
        // CREATE TABLE IF NOT EXISTS needs CREATE on the schema even when the table exists.
        const exists = await client.query("SELECT to_regclass('public.eiai_migration')");
        if (!exists.rows[0]["to_regclass"]) {
            await client.query("CREATE TABLE IF NOT EXISTS eiai_migration (name varchar(128) PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
        }
        const res = await client.query("SELECT name FROM eiai_migration");
        const applied = new Set(res.rows.map((r) => r.name));
        const pending = fs.readdirSync(dir).filter((f) => f.endsWith(".sql") && !applied.has(f)).sort();
        for (const name of pending) {
            const sql = fs.readFileSync(path.join(dir, name), "utf8");
            try {
                await client.query("BEGIN");
                await client.query(sql);
                await client.query("INSERT INTO eiai_migration (name) VALUES ($1)", [name]);
                await client.query("COMMIT");
                console.log(`[migration] ${name} applied.`);
            } catch (err: any) {
                await client.query("ROLLBACK").catch(() => {});
                console.error(`❌ [migration] ${name} failed and was rolled back, later migrations skipped: `, err.message);
                return;
            }
        }
    } catch (err: any) {
        console.error("❌ [migration] could not check or prepare migrations, skipped: ", err.message);
    } finally {
        await client.query(`select pg_advisory_unlock(${MIGRATION_LOCK_ID})`).catch(() => {});
    }
}

export default async function () {
    if (config.skipDbInstall) {
        console.log("[init] SKIP_DB_INSTALL is set, skip database migrations.");
        return;
    }
    if (!config.pgsql.host || !config.pgsql.database) {
        console.error("❌ Postgres not configured, skip installation.");
        console.log("💡 You can only access BRConnector using the API key stored in the ADMIN_API_KEY environment variable.");
        return;
    }

    const client = new Client({
        host: config.pgsql.host,
        port: config.pgsql.port ? ~~config.pgsql.port : 5432,
        database: config.pgsql.database,
        user: config.pgsql.user,
        password: config.pgsql.password,
        // A blackholed host otherwise waits out the OS TCP timeout (~75-130 s). 10 s matches the
        // platform's init limit; it does not bound the query path.
        connectionTimeoutMillis: 10000,
    })
    try {
        await client.connect();
    } catch (err: any) {
        console.error("❌ Postgres connection error: ", err.message);
        return;
    }
    console.log("Postgres connected.");
    try {
        // Session-level lock around the whole install, so instances that start together on an empty
        // database do not run create.sql and the patches at the same time. runMigrations takes it
        // again; a session can hold it more than once, and each lock needs its own unlock.
        await client.query(`select pg_advisory_lock(${MIGRATION_LOCK_ID})`);
        try {
            await installTables(client);
        } finally {
            await client.query(`select pg_advisory_unlock(${MIGRATION_LOCK_ID})`).catch(() => {});
        }
    } finally {
        await client.end().catch(() => {});
    }
    const adminKey = config.admin_api_key;
    if (!adminKey) {
        console.error("❌ Admin API key not set, please set 'ADMIN_API_KEY' in env.");
    }
}

/** create.sql and the old patches, each skipped when its table exists, then the migrations. */
async function installTables(client: Pick<Client, "query">): Promise<void> {
    console.log("[init] Check database status...");
    const sql = "SELECT to_regclass('public.eiai_key')";
    const res = await client.query(sql);
    const regClass = res.rows[0]["to_regclass"];
    if (regClass) {
        console.log("[init] Tables created, skip installation.");
    } else {
        console.log("[init] Tables not exists, installing...");
        const sqlPath = path.join(__dirname, "./scripts/create.sql");
        const sqlCreate = fs.readFileSync(sqlPath, "utf8");
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
        const sqlPath = path.join(__dirname, "./scripts/patch-0.0.5.sql");
        const sqlCreate_0_0_5 = fs.readFileSync(sqlPath, "utf8");
        await client.query(sqlCreate_0_0_5);
        console.log("[v0.0.5] Created  successfully.");
    }

    // 0.0.12 install...
    console.log("[v0.0.12] Check database status...");
    const sql_0_0_12 = "SELECT to_regclass('public.eiai_bot_connector')";
    const res_0_0_12 = await client.query(sql_0_0_12);
    const regClass_0_0_12 = res_0_0_12.rows[0]["to_regclass"];
    if (regClass_0_0_12) {
        console.log("[v0.0.12] Tables created, skip installation.");
    } else {
        console.log("[v0.0.12] Tables not exists, installing...");
        const sqlPath = path.join(__dirname, "./scripts/patch-0.0.12.sql");
        const sqlCreate_0_0_12 = fs.readFileSync(sqlPath, "utf8");
        await client.query(sqlCreate_0_0_12);
        console.log("[v0.0.12] Created  successfully.");
    }

    await runMigrations(client);
}
