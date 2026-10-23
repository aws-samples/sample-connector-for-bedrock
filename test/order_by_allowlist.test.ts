import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import http from 'http';
import type { AddressInfo } from 'net';
import type { Server } from 'http';

// Drives the real auth, controllers and services with a recording DB client, so the assertions are on the SQL text built.
const MARKER = 'zz_marker_col';
const ADMIN = 'admin-key-for-test';
const USER = 'user-key-for-test';

let server: Server;
let base: string;
let sqls: string[] = [];
let bound: any[][] = [];

beforeAll(async () => {
    vi.stubEnv('ADMIN_API_KEY', ADMIN);
    vi.stubEnv('PGSQL_HOST', '');
    vi.stubEnv('PGSQL_DATABASE', '');
    vi.resetModules();
    const Koa = (await import('koa')).default;
    const PGClient = (await import('../src/util/postgres')).default;
    const Router = (await import('koa-router')).default;
    const router = new Router();
    (await import('../src/controller/user/SessionController')).default(router);
    (await import('../src/controller/admin/PaymentController')).default(router);
    const { authHandler, errorHandler, loggerHandler } = await import('../src/middleware/handlers');
    const app = new Koa();
    app.use(loggerHandler);
    app.use(errorHandler);
    app.use(async (ctx: any, next: any) => {
        const db = new PGClient();
        db.pool = {
            query: async (sql: string, params?: any[]) => {
                sqls.push(sql);
                bound.push(params ?? []);
                return { rows: /count\(\*\)/.test(sql) ? [{ ct: 0 }] : [], rowCount: 0 };
            },
        };
        ctx.db = db;
        ctx.cache = { api_keys: [{ id: 7, api_key: USER, name: 'u', role: 'user' }], models: [], connectors: [] };
        await next();
    });
    app.use(authHandler);
    app.use(router.routes());
    server = http.createServer(app.callback());
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}, 60000);
afterAll(async () => {
    if (server) {
        server.closeAllConnections?.();
        await new Promise((resolve) => server.close(resolve));
    }
    vi.unstubAllEnvs();
});
beforeEach(() => { sqls = []; bound = []; });

async function listSql(path: string, key: string, orderBy?: string): Promise<string> {
    const qs = orderBy === undefined ? '' : `&orderBy=${encodeURIComponent(orderBy)}`;
    const res = await fetch(`${base}${path}?limit=5${qs}`, { headers: { authorization: `Bearer ${key}` } });
    expect(res.status).toBe(200);
    const select = sqls.find((s) => /^select \*/.test(s));
    expect(select).toBeDefined();
    return select!.replace(/\s+/g, ' ').trim();
}

const routes = [
    { name: 'session', path: '/user/session/list', key: USER, allowed: { 'id desc': 'id desc', 'id asc': 'id asc', 'updated_at desc': 'updated_at desc', 'total_fee desc': 'total_fee desc' } },
    { name: 'payment', path: '/admin/payment/list', key: ADMIN, allowed: { 'id desc': 'id desc', 'id asc': 'id asc', 'created_at desc': 'created_at desc' } },
] as Record<string, any>[];

describe.each(routes)('$name list orderBy', ({ path, key, allowed }) => {
    it('uses the default order when orderBy is absent', async () => {
        expect(await listSql(path, key)).toMatch(/ order by id desc limit 5 offset 0$/);
    });

    it.each([MARKER, `id; select ${MARKER}`, 'id desc, ' + MARKER, '(select 1)', 'ID DESC', 'created_at asc'])('falls back to the default for %s', async (value) => {
        const sql = await listSql(path, key, value);
        expect(sql).toMatch(/ order by id desc limit 5 offset 0$/);
        expect(sqls.join('\n')).not.toContain(MARKER);
    });

    it('does not accept an array value', async () => {
        const res = await fetch(`${base}${path}?limit=5&orderBy=${MARKER}&orderBy=id%20asc`, { headers: { authorization: `Bearer ${key}` } });
        expect(res.status).toBe(200);
        expect(sqls.join('\n')).not.toContain(MARKER);
        expect(sqls.find((s) => /^select \*/.test(s))).toMatch(/order by id desc limit/);
    });

    it('scopes the session list to the caller key id', async () => {
        if (path !== '/user/session/list') return;
        const sql = await listSql(path, key);
        expect(sql).toContain('key_id = $1');
        expect(bound[sqls.findIndex((q) => /^select \*/.test(q))]).toEqual([7]);
    });

    it('maps each allowed value to its own fragment', async () => {
        for (const [value, fragment] of Object.entries(allowed)) {
            sqls = []; bound = [];
            expect(await listSql(path, key, value)).toMatch(new RegExp(` order by ${fragment} limit 5 offset 0$`));
        }
    });
});
