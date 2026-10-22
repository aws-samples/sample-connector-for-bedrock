import http from 'http';
import net from 'net';
import Koa from 'koa';
import { koaBody } from 'koa-body';
import fs, { readdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import providers, { RETIRED_PROVIDERS } from '../src/providers/provider';
import v1 from '../src/controller/runtime/v1';
import anthropic from '../src/controller/runtime/anthropic';
import { errorHandler } from '../src/middleware/handlers';
import PGClient from '../src/util/postgres';
import threadService from '../src/service/thread';
import sessionService from '../src/service/session';

const RETIRED = ['aws-executor', 'urls-reader', 'web-miner'];
const retiredMessage = (name: string) => `Provider ${name} has been retired; use Claude Code Web (/cc) instead.`;
const user = { id: 1, group_id: 1, api_key: 'k', month_fee: '0', month_quota: '10', balance: '0', updated_at: new Date() };
const oldModel = (provider: string) => ({ id: 40, name: 'old-model', provider, multiple: 1, model_type: 1, price_in: 0, price_out: 0, config: {} });

describe('RETIRED_PROVIDERS', () => {
    it('maps each retired provider to Claude Code Web', () => {
        expect(RETIRED_PROVIDERS).toEqual({
            'aws-executor': 'Claude Code Web (/cc)',
            'urls-reader': 'Claude Code Web (/cc)',
            'web-miner': 'Claude Code Web (/cc)',
        });
    });
    it.each(RETIRED)('createProvider(%s) answers with the retired message as a 400', (name) => {
        let thrown: any;
        try { providers.createProvider(name); } catch (ex) { thrown = ex; }
        expect(thrown).toMatchObject({ message: retiredMessage(name), anthropicType: 'invalid_request_error' });
    });
    it('is not listed among the providers an admin can pick', () => {
        for (const name of RETIRED) expect(Object.keys(providers)).not.toContain(name);
        expect(Object.keys(providers)).not.toContain('RETIRED_PROVIDERS');
    });
});

describe('a request for a model on a retired provider', () => {
    let server: http.Server;
    let port: number;
    let models: any[] = [];

    beforeAll(async () => {
        const app = new Koa();
        app.use(async (ctx: any, next: any) => {
            const log = () => {};
            ctx.logger = { error: log, warn: log, info: log, debug: log };
            await next();
        });
        app.use(errorHandler);
        app.use(koaBody({ encoding: 'utf-8', jsonLimit: '1mb' }));
        app.use(async (ctx: any) => {
            ctx.user = { ...user };
            ctx.db = { exists: async () => true };
            ctx.cache = { models };
            const path = ctx.path.toLowerCase();
            if (path === '/v1/chat/completions') return v1.chat_completions(ctx);
            if (path === '/v1/completions') return v1.completions(ctx);
            if (path === '/v1/embeddings') return v1.embeddings(ctx);
            if (path === '/v1/images/generations') return v1.images(ctx);
            if (path === '/v1/messages') return anthropic.messages(ctx);
            ctx.status = 404;
        });
        server = http.createServer(app.callback());
        await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
        port = (server.address() as net.AddressInfo).port;
    });
    afterAll(async () => {
        server.closeAllConnections?.();
        await new Promise((r) => server.close(r));
    });

    const post = async (path: string, body: any) => {
        const res = await fetch(`http://127.0.0.1:${port}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
        return { status: res.status, body: await res.json() };
    };
    const chat = { messages: [{ role: 'user', content: 'hi' }] };

    it('answers a model whose provider is retired with a 400 that points to Claude Code Web', async () => {
        models = [{ ...oldModel('web-miner'), name: 'old-web' }];
        const res = await post('/v1/chat/completions', { model: 'old-web', ...chat });
        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.error.message).toMatch(/retired.*Claude Code Web/i);
        expect(res.body.error.message).toBe(retiredMessage('web-miner'));
    });

    it.each(RETIRED)('answers %s the same way on every OpenAI-format endpoint', async (name) => {
        models = [oldModel(name)];
        for (const [path, extra] of [['/v1/chat/completions', chat], ['/v1/completions', chat], ['/v1/embeddings', { input: 'hi' }], ['/v1/images/generations', { prompt: 'a cat' }]] as const) {
            const res = await post(path, { model: 'old-model', ...extra });
            expect(res.status, path).toBe(400);
            expect(res.body.error.message, path).toBe(retiredMessage(name));
        }
    });

    it.each(RETIRED)('answers %s on /v1/messages with an Anthropic invalid_request_error', async (name) => {
        models = [oldModel(name)];
        const res = await post('/v1/messages', { model: 'old-model', max_tokens: 10, ...chat });
        expect(res.status).toBe(400);
        expect(res.body).toEqual({ type: 'error', error: { type: 'invalid_request_error', message: retiredMessage(name) } });
    });

    it('once the migration has removed the row, the old name gets the normal unknown-model answer', async () => {
        models = [];
        const res = await post('/v1/chat/completions', { model: 'old-web', ...chat });
        expect(res.status).toBe(400);
        expect(res.body.error.message).toBe('The model [old-web] not found.');
        const msg = await post('/v1/messages', { model: 'old-web', max_tokens: 10, ...chat });
        expect(msg.status).toBe(404);
        expect(msg.body).toEqual({ type: 'error', error: { type: 'not_found_error', message: 'The model [old-web] not found.' } });
    });
});

describe('the retire migration', () => {
    const NAME = '2026-10-22-retire-providers.sql';
    const dir = join(__dirname, '../src/scripts/migrations');
    const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
    const sql = files.includes(NAME) ? readFileSync(join(dir, NAME), 'utf8') : '';
    // The statements, without comments.
    const statements = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
        .split(';').map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const providerList = RETIRED.map((p) => `'${p}'`).join(', ');

    it("pins the retire migration's statements", () => {
        expect(files.indexOf(NAME)).toBeGreaterThan(files.indexOf('2026-10-20b-claude-chat-presets.sql'));
        expect(statements).toEqual([
            `DELETE FROM eiai_key_model WHERE model_id IN (SELECT id FROM eiai_model WHERE provider IN (${providerList}))`,
            `DELETE FROM eiai_group_model WHERE model_id IN (SELECT id FROM eiai_model WHERE provider IN (${providerList}))`,
            `DELETE FROM eiai_model WHERE provider IN (${providerList})`,
        ]);
        expect(Object.keys(RETIRED_PROVIDERS).sort()).toEqual(RETIRED);
        expect(sql).not.toMatch(/\b(BEGIN|COMMIT|ROLLBACK|CONCURRENTLY|eiai_thread|eiai_session)\b/i);
    });

    // Real Postgres (PGlite) behind the real src/install.ts: create.sql, the patches, then the migration runner.
    describe('on Postgres', () => {
        let db: PGlite;
        let queries: string[] = [];
        const TABLES = ['eiai_key', 'eiai_model', 'eiai_key_model', 'eiai_group', 'eiai_group_model', 'eiai_session', 'eiai_thread', 'eiai_payment', 'eiai_bot_connector'];
        const VIEWS = ['eiai_v_group_model', 'eiai_v_key_model', 'eiai_v_key_group'];

        // pg's Client.query on PGlite: parameterised statements go through query(), scripts through exec().
        const run = async (text: string, params?: any[]) => {
            queries.push(text);
            if (params?.length) {
                const r = await db.query(text, params);
                return { rows: r.rows as any[], rowCount: r.affectedRows ?? r.rows.length };
            }
            const results = await db.exec(text);
            const last = results[results.length - 1];
            return { rows: (last?.rows ?? []) as any[], rowCount: last?.affectedRows ?? 0 };
        };
        // The app's PG client with PGlite in place of the pg pool, for the history services.
        const appDb = () => Object.assign(new PGClient(), { pool: { query: run } });

        // Runs install against PGlite. withRetire=false is the install from before this change.
        const install = async (withRetire: boolean) => {
            vi.resetModules();
            for (const [k, v] of Object.entries({ PGSQL_HOST: 'h', PGSQL_DATABASE: 'd', SKIP_DB_INSTALL: '', ADMIN_API_KEY: 'k' })) vi.stubEnv(k, v);
            vi.doMock('pg', () => ({ Client: class { async connect() {} async end() {} query(text: string, params?: any[]) { return run(text, params); } } }));
            const real = fs.readdirSync;
            const hide = withRetire ? null : vi.spyOn(fs, 'readdirSync').mockImplementation(((p: any, ...a: any[]) => {
                const listed = (real as any)(p, ...a);
                return resolve(String(p)) === resolve(dir) ? listed.filter((f: string) => f !== NAME) : listed;
            }) as any);
            const start = queries.length;
            try {
                await (await import('../src/install')).default();
            } finally {
                hide?.mockRestore();
                vi.doUnmock('pg');
            }
            return queries.slice(start);
        };
        const reset = () => db.exec('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
        const snapshot = async ({ stripTimes = false } = {}) => {
            const out: Record<string, any[]> = {};
            for (const t of [...TABLES, ...VIEWS]) {
                const { rows } = await db.query<any>(`SELECT * FROM ${t} ORDER BY id`);
                out[t] = stripTimes ? rows.map(({ created_at, updated_at, ...r }) => r) : rows;
            }
            out.ledger = (await db.query<any>('SELECT name FROM eiai_migration ORDER BY name')).rows.map((r) => r.name);
            return out;
        };
        const history = async (keyId: number, sessionId: number, threadId: number) => ({
            adminThreads: await threadService.list(appDb(), { limit: 100 }),
            userThreads: await threadService.list(appDb(), { key_id: keyId, limit: 100 }),
            sessionThreads: await threadService.list(appDb(), { session_id: sessionId, limit: 100 }),
            threadDetail: await threadService.detail(appDb(), { id: threadId, key_id: keyId }),
            adminSessions: await sessionService.list(appDb(), { limit: 100 }),
            userSessions: await sessionService.list(appDb(), { key_id: keyId, limit: 100 }),
        });

        beforeAll(async () => { db = await PGlite.create(); }, 30000);
        afterAll(async () => { await db?.close(); });
        afterEach(() => {
            vi.restoreAllMocks();
            vi.unstubAllEnvs();
            vi.resetModules();
        });

        it('removes only retired-provider models and their bindings, and keeps threads and sessions', async () => {
            vi.spyOn(console, 'log').mockImplementation(() => {});
            await reset();
            await install(false);
            // One model per retired provider and a converse model, each bound to two keys and two groups,
            // and one thread per model in a session.
            await db.exec(`
                INSERT INTO eiai_group (name) VALUES ('group 2');
                INSERT INTO eiai_key (group_id, api_key, name) VALUES (1, 'br-k1', 'k1'), (2, 'br-k2', 'k2');
                INSERT INTO eiai_model (name, multiple, provider, config, price_in, price_out) VALUES
                    ('old-exec', 1, 'aws-executor', '{"localLlmModel": "claude-haiku-5-5-chat"}', 0, 0),
                    ('old-urls', 1, 'urls-reader', '{"localLlmModel": "claude-haiku-5-5-chat"}', 0, 0),
                    ('old-web', 1, 'web-miner', '{"localLlmModel": "claude-haiku-5-5-chat"}', 0, 0),
                    ('my-converse', 1, 'bedrock-converse', '{"modelId": "amazon.nova-micro-v1:0"}', 0.035e-6, 0.14e-6);
                INSERT INTO eiai_key_model (key_id, model_id)
                    SELECT k.id, m.id FROM eiai_key k, eiai_model m WHERE m.name IN ('old-exec', 'old-urls', 'old-web', 'my-converse');
                INSERT INTO eiai_group_model (group_id, model_id)
                    SELECT g.id, m.id FROM eiai_group g, eiai_model m WHERE m.name IN ('old-exec', 'old-urls', 'old-web', 'my-converse');
                INSERT INTO eiai_session (key, title, key_id, total_in_tokens, total_out_tokens, total_fee)
                    SELECT 's-1', 'chat', id, 40, 40, 0.0001 FROM eiai_key WHERE name = 'k1';
                INSERT INTO eiai_thread (prompt, completion, key_id, model_id, session_id, session_key, tokens_in, tokens_out, fee)
                    SELECT 'q ' || m.name, 'a ' || m.name, k.id, m.id, s.id, 's-1', 10, 10, 0.00001
                    FROM eiai_key k, eiai_model m, eiai_session s
                    WHERE k.name = 'k1' AND m.name IN ('old-exec', 'old-urls', 'old-web', 'my-converse') ORDER BY m.id;
            `);
            const one = async (q: string) => (await db.query<any>(q)).rows[0].id;
            const k1 = await one(`SELECT id FROM eiai_key WHERE name = 'k1'`);
            const s1 = await one(`SELECT id FROM eiai_session WHERE key = 's-1'`);
            const webThread = await one(`SELECT t.id FROM eiai_thread t JOIN eiai_model m ON m.id = t.model_id WHERE m.name = 'old-web'`);
            const retiredIds = (await db.query<any>(`SELECT id FROM eiai_model WHERE provider IN (${providerList})`)).rows.map((r) => r.id);
            const before = await snapshot();
            const historyBefore = await history(k1, s1, webThread);
            expect(retiredIds).toHaveLength(3);
            expect(before.ledger).toEqual(files.filter((f) => f !== NAME));

            const sent = await install(true);
            const after = await snapshot();
            const kept = (rows: any[]) => rows.filter((r) => !retiredIds.includes(r.model_id));

            // Applied once, inside the runner's transaction, and recorded.
            const at = sent.indexOf(sql);
            expect(sent.slice(at - 1, at + 3)).toEqual(['BEGIN', sql, 'INSERT INTO eiai_migration (name) VALUES ($1)', 'COMMIT']);
            expect(after.ledger).toEqual([...before.ledger, NAME].sort());
            // Retired models and their bindings are gone; everything else is as it was.
            expect(after.eiai_model.filter((m) => RETIRED.includes(m.provider))).toEqual([]);
            expect(after.eiai_model).toEqual(before.eiai_model.filter((m) => !RETIRED.includes(m.provider)));
            expect(after.eiai_model.map((m) => m.name)).toContain('my-converse');
            expect(after.eiai_key_model).toEqual(kept(before.eiai_key_model));
            expect(after.eiai_group_model).toEqual(kept(before.eiai_group_model));
            expect(after.eiai_key_model).toHaveLength(2);
            expect(before.eiai_key_model).toHaveLength(8);
            for (const t of ['eiai_key', 'eiai_group', 'eiai_payment', 'eiai_bot_connector', 'eiai_v_key_group']) expect(after[t], t).toEqual(before[t]);
            // The binding views have no row without a model.
            expect(after.eiai_v_key_model).toEqual(kept(before.eiai_v_key_model));
            expect(after.eiai_v_group_model).toEqual(kept(before.eiai_v_group_model));
            expect([...after.eiai_v_key_model, ...after.eiai_v_group_model].filter((r) => r.model_name === null)).toEqual([]);
            // History is untouched.
            expect(after.eiai_thread).toHaveLength(4);
            expect(after.eiai_session).toHaveLength(1);
            expect(after.eiai_thread).toEqual(before.eiai_thread);
            expect(after.eiai_session).toEqual(before.eiai_session);
            expect(await history(k1, s1, webThread)).toEqual(historyBefore);

            // A second start applies nothing.
            const again = await install(true);
            expect(again).toContain('SELECT name FROM eiai_migration');
            expect(again).not.toContain('BEGIN');
            expect(again).not.toContain(sql);
            expect(await snapshot()).toEqual(after);
        }, 30000);

        it('leaves a fresh install as it was, apart from the ledger row', async () => {
            vi.spyOn(console, 'log').mockImplementation(() => {});
            await reset();
            await install(false);
            const old = await snapshot({ stripTimes: true });
            await reset();
            await install(true);
            const now = await snapshot({ stripTimes: true });
            const { ledger: oldLedger, ...oldTables } = old;
            const { ledger: newLedger, ...newTables } = now;
            expect(newTables).toEqual(oldTables);
            expect(newLedger).toEqual([...oldLedger, NAME].sort());
            expect(now.eiai_model.length).toBeGreaterThan(0);
        }, 30000);
    });
});
