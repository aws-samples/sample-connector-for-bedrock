import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Koa from 'koa';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import PGClient from '../src/util/postgres';
import config from '../src/config';
import { authHandler, errorHandler, loggerHandler } from '../src/middleware/handlers';
import Router from 'koa-router';
import adminThread from '../src/controller/admin/ThreadController';
import userThread from '../src/controller/user/ThreadController';

// Real router, controllers, services and SQL builder; the pool only records.
type Call = { sql: string; params: any[] };
const calls: Call[] = [];
const fakeDb = () => {
    const db: any = new PGClient();
    db.pool = {
        query: async (sql: string, params: any[]) => {
            calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
            if (/count\(\*\)/.test(sql)) return { rows: [{ ct: 0 }], rowCount: 1 };
            return { rows: [], rowCount: 0 };
        },
    };
    return db;
};
const userKey = { id: 5, api_key: 'user-key-5', group_id: 0, role: 'user', month_fee: '0', month_quota: '10', balance: '0', updated_at: new Date() };

const ADMIN_KEY = 'admin-key-for-test';
let server: Server;
const get = async (path: string, key = 'user-key-5') => {
    calls.length = 0;
    const port = (server.address() as AddressInfo).port;
    const res = await fetch(`http://127.0.0.1:${port}${path}`, { headers: { authorization: `Bearer ${key}` } });
    await res.text();
    return { status: res.status, select: calls.find((c) => /^select (?!count)/.test(c.sql)), count: calls.find((c) => /select count/.test(c.sql)) };
};

beforeEach(async () => {
    (config as any).admin_api_key = ADMIN_KEY;
    const app = new Koa();
    app.use(loggerHandler);
    app.use(errorHandler);
    app.use(async (ctx: any, next) => { ctx.db = fakeDb(); ctx.cache = { api_keys: [userKey], models: [], connectors: [] }; await next(); });
    app.use(authHandler);
    const router = new Router();
    adminThread(router);
    userThread(router);
    app.use(router.routes());
    server = app.listen(0);
});
afterEach(() => { server.close(); });

describe('/user/thread/list', () => {
    it('filters on the caller key id', async () => {
        const r = await get('/user/thread/list');
        expect(r.status).toBe(200);
        expect(r.select!.sql).toMatch(/key_id = \$1/);
        expect(r.select!.params).toEqual([5]);
        expect(r.count!.sql).toMatch(/key_id = \$1/);
        expect(r.count!.params).toEqual([5]);
    });
    it('ignores a key_id supplied in the query', async () => {
        const r = await get('/user/thread/list?key_id=7');
        expect(r.select!.params).toEqual([5]);
    });
    it('applies the key id together with a session_id filter', async () => {
        const r = await get('/user/thread/list?session_id=999');
        expect(r.select!.sql).toMatch(/session_id = \$\d/);
        expect(r.select!.sql).toMatch(/key_id = \$\d/);
        expect(r.select!.params).toHaveLength(2);
        expect(r.select!.params).toEqual(expect.arrayContaining([5, '999']));
        // each placeholder is bound to the right value
        const idx = (col: string) => Number(new RegExp(`${col} = \\$(\\d)`).exec(r.select!.sql)![1]) - 1;
        expect(r.select!.params[idx('key_id')]).toBe(5);
        expect(r.select!.params[idx('session_id')]).toBe('999');
    });
    it('binds the key id with a search term as well', async () => {
        const r = await get('/user/thread/list?q=hello');
        const m = /key_id = \$(\d)/.exec(r.select!.sql)!;
        expect(r.select!.params[Number(m[1]) - 1]).toBe(5);
        expect(r.select!.params).toContain('%hello%');
    });
    it('caps limit at 100', async () => {
        const r = await get('/user/thread/list?limit=100000');
        expect(r.select!.sql).toMatch(/limit 100 offset/);
    });
    it('keeps a small limit and rejects a negative one', async () => {
        expect((await get('/user/thread/list?limit=7')).select!.sql).toMatch(/limit 7 offset/);
        expect((await get('/user/thread/list?limit=-5')).select!.sql).toMatch(/limit 20 offset/);
    });
});

describe('/admin/thread/list', () => {
    it('stays unscoped for the admin key', async () => {
        const r = await get('/admin/thread/list', ADMIN_KEY);
        expect(r.status).toBe(200);
        expect(r.select!.sql).toMatch(/where 1=1 order by id desc limit 20 offset 0/);
        expect(r.select!.params).toEqual([]);
    });
    it('still honours an explicit key_id filter', async () => {
        const r = await get('/admin/thread/list?key_id=3', ADMIN_KEY);
        expect(r.select!.params).toEqual(['3']);
    });
});
