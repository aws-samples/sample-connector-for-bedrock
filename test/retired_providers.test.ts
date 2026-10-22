import http from 'http';
import net from 'net';
import Koa from 'koa';
import { koaBody } from 'koa-body';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import providers, { RETIRED_PROVIDERS } from '../src/providers/provider';
import v1 from '../src/controller/runtime/v1';
import anthropic from '../src/controller/runtime/anthropic';
import { errorHandler } from '../src/middleware/handlers';
import { fakePg } from './helpers/fakes';

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
        for (const [path, extra] of [['/v1/chat/completions', chat], ['/v1/embeddings', { input: 'hi' }], ['/v1/images/generations', { prompt: 'a cat' }]] as const) {
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

    it('the retire migration removes only retired-provider models and their bindings', () => {
        expect(files.at(-1)).toBe(NAME);
        expect(statements).toEqual([
            `DELETE FROM eiai_key_model WHERE model_id IN (SELECT id FROM eiai_model WHERE provider IN (${providerList}))`,
            `DELETE FROM eiai_group_model WHERE model_id IN (SELECT id FROM eiai_model WHERE provider IN (${providerList}))`,
            `DELETE FROM eiai_model WHERE provider IN (${providerList})`,
        ]);
        expect(Object.keys(RETIRED_PROVIDERS).sort()).toEqual(RETIRED);
        expect(sql).not.toMatch(/\b(BEGIN|COMMIT|ROLLBACK|CONCURRENTLY|eiai_thread|eiai_session)\b/i);
    });

    describe('with the install runner', () => {
        beforeEach(() => {
            vi.spyOn(console, 'log').mockImplementation(() => {});
            vi.spyOn(console, 'error').mockImplementation(() => {});
        });
        afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.resetModules(); vi.doUnmock('pg'); });

        const loadInstall = async (fake: ReturnType<typeof fakePg>) => {
            vi.resetModules();
            for (const [k, v] of Object.entries({ PGSQL_HOST: 'h', PGSQL_DATABASE: 'd', SKIP_DB_INSTALL: '', ADMIN_API_KEY: 'k' })) vi.stubEnv(k, v);
            vi.doMock('pg', () => ({ Client: fake.Client }));
            return import('../src/install');
        };

        it('applies it once on an existing database, inside a transaction, and not on the next start', async () => {
            const fake = fakePg({ tables: ['eiai_key', 'eiai_model', 'eiai_group', 'eiai_group_model', 'eiai_bot_connector', 'eiai_migration'] });
            fake.db.ledger.push(...files.filter((f) => f !== NAME));
            await (await loadInstall(fake)).default();
            const at = fake.queries.indexOf(sql);
            expect(at).toBeGreaterThan(0);
            expect(fake.queries[at - 1]).toBe('BEGIN');
            expect(fake.queries.slice(at + 1, at + 3)).toEqual(['INSERT INTO eiai_migration (name) VALUES ($1)', 'COMMIT']);
            expect(fake.db.ledger.at(-1)).toBe(NAME);
            const first = fake.queries.length;
            await (await loadInstall(fake)).default();
            expect(fake.queries.slice(first)).not.toContain(sql);
            expect(fake.queries.slice(first)).not.toContain('BEGIN');
        });
    });
});
