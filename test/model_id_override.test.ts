import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Koa from 'koa';
import { koaBody } from 'koa-body';
import Router from 'koa-router';
import http from 'http';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { BedrockRuntimeClient, ConverseCommand, ConverseStreamCommand, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import PGClient from '../src/util/postgres';
import { authHandler, errorHandler } from '../src/middleware/handlers';
import v1 from '../src/controller/runtime/v1';
import anthropic from '../src/controller/runtime/anthropic';
import { HERMETIC_ENV } from './helpers/hermetic_env';

// Real controllers and providers behind the routes src/routes.ts gives them; Bedrock is a stub that records each
// modelId, and the database accepts every statement.

const MESSAGE = 'Model id override (name/<id>) is not supported; ask an administrator to add the model.';

const models = [
    { id: 7, name: 'cheap-model', provider: 'bedrock-converse', price_in: 1e-7, price_out: 2e-7, config: { modelId: 'test.cheap-v1:0', regions: ['us-east-1'] } },
    { id: 9, name: 'embed-model', provider: 'titan-embeddings', price_in: 1e-7, price_out: 0, config: { modelId: 'test.embed-v1:0', regions: ['us-east-1'] } },
    { id: 8, name: 'team/special', provider: 'bedrock-converse', price_in: 1e-7, price_out: 2e-7, config: { modelId: 'test.special-v1:0', regions: ['us-east-1'] } },
    { id: 10, name: 'team/claude', provider: 'bedrock-runtime-anthropic', price_in: 1e-7, price_out: 2e-7,
        config: { modelId: 'test.claude-v1:0', regions: ['us-east-1'], credentials: [{ accessKeyId: 'test-ak', secretAccessKey: 'fake-secret' }] } },
];
const keys = [
    { id: 5, api_key: 'user-key', group_id: 1, role: 'user', month_fee: '0', month_quota: '10', balance: '0', total_fee: '0', updated_at: new Date() },
    { id: 6, api_key: 'admin-key', group_id: 1, role: 'admin', month_fee: '0', month_quota: '10', balance: '0', total_fee: '0', updated_at: new Date() },
];

const routes: [string, any][] = [
    ['/v1/chat/completions', v1.chat_completions],
    ['/v1/completions', v1.completions],
    ['/v1/messages', anthropic.messages],
    ['/v1/embeddings', v1.embeddings],
];

const modelIds: string[] = [];
let server: Server;
let base: string;

async function* converseStream() {
    yield { messageStart: { role: 'assistant' } };
    yield { contentBlockDelta: { contentBlockIndex: 0, delta: { text: 'HELLO' } } };
    yield { messageStop: { stopReason: 'end_turn' } };
    yield { metadata: { usage: { inputTokens: 10, outputTokens: 10 }, metrics: { latencyMs: 5 } } };
}

beforeAll(() => {
    const db: any = new PGClient();
    db.pool = {
        query: async (text: string) => {
            if (/^\s*select count\(\*\)/i.test(text)) return { rows: [{ ct: 1 }], rowCount: 1 };
            if (/^\s*select \* from eiai_session/i.test(text)) return { rows: [], rowCount: 0 };
            return { rows: [{ id: 1 }], rowCount: 1 };
        },
    };
    const app = new Koa();
    app.use(async (ctx: any, next) => {
        ctx.logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };
        await next();
    });
    app.use(errorHandler);
    app.use(koaBody({ jsonLimit: '1mb' }));
    app.use(async (ctx: any, next) => {
        ctx.db = db;
        ctx.cache = { api_keys: keys, models, connectors: [] };
        ctx.performanceMode = false;
        await next();
    });
    app.use(authHandler);
    const router = new Router();
    for (const [route, handler] of routes) router.post(route, handler);
    app.use(router.routes());
    server = app.listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => {
    server.close();
});
beforeEach(() => {
    for (const [name, value] of Object.entries(HERMETIC_ENV)) vi.stubEnv(name, value);
    modelIds.length = 0;
    vi.spyOn(BedrockRuntimeClient.prototype as any, 'send').mockImplementation(async (command: any) => {
        modelIds.push(command.input.modelId);
        if (command instanceof ConverseStreamCommand) return { stream: converseStream() };
        if (command instanceof ConverseCommand) {
            return {
                output: { message: { role: 'assistant', content: [{ text: 'HELLO' }] } },
                usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
                metrics: { latencyMs: 5 },
                stopReason: 'end_turn',
                $metadata: { requestId: 'req-1' },
            };
        }
        if (command instanceof InvokeModelCommand) {
            return { body: new TextEncoder().encode(JSON.stringify({ embedding: [0.1], inputTextTokenCount: 10 })) };
        }
        throw new Error(`unexpected command ${command.constructor.name}`);
    });
});
afterEach(() => {
    vi.restoreAllMocks();
});

async function post(path: string, model: string, apiKey: string, extra: Record<string, any> = {}) {
    const body: any = path === '/v1/messages'
        ? { model, max_tokens: 100, messages: [{ role: 'user', content: 'hi' }], ...extra }
        : path === '/v1/embeddings'
            ? { model, input: 'hi', ...extra }
            : { model, stream: false, messages: [{ role: 'user', content: 'hi' }], ...extra };
    const res = await fetch(base + path, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
    });
    return { status: res.status, json: JSON.parse(await res.text()) };
}

describe.each(routes.map(([route]) => route).filter((r) => r !== '/v1/embeddings'))('model id override on %s', (route) => {
    it.each(['user-key', 'admin-key'])('%s: cheap-model/OTHER.model:0 gets a 400 and Bedrock is not called', async (apiKey) => {
        const res = await post(route, 'cheap-model/OTHER.model:0', apiKey);
        expect(res.status).toBe(400);
        if (route === '/v1/messages') {
            expect(res.json).toEqual({ type: 'error', error: { type: 'invalid_request_error', message: MESSAGE } });
        } else {
            expect(res.json).toMatchObject({ success: false, data: MESSAGE });
        }
        expect(modelIds).toEqual([]);
    });

    it('a configured model whose name contains "/" is used as is', async () => {
        const res = await post(route, 'team/special', 'user-key');
        expect(res.status).toBe(200);
        expect(modelIds).toEqual(['test.special-v1:0']);
    });

    it('a plain configured model is unchanged', async () => {
        const res = await post(route, 'cheap-model', 'user-key');
        expect(res.status).toBe(200);
        expect(modelIds).toEqual(['test.cheap-v1:0']);
    });
});

describe.each(routes.map(([route]) => route))('client-supplied model_id on %s', (route) => {
    it('is ignored: Bedrock gets the configured model id', async () => {
        const model = route === '/v1/embeddings' ? 'embed-model' : 'cheap-model';
        const res = await post(route, model, 'user-key', { model_id: 'OTHER.model:0' });
        expect(res.status).toBe(200);
        expect(modelIds).toEqual([route === '/v1/embeddings' ? 'test.embed-v1:0' : 'test.cheap-v1:0']);
    });
});

describe('native /v1/messages (bedrock-runtime-anthropic)', () => {
    // The native provider posts through the transport's shared NodeHttpHandler; this stands in for Bedrock.
    function nativeBedrock() {
        const sent: { path: string; model: string }[] = [];
        vi.spyOn(NodeHttpHandler.prototype, 'handle').mockImplementation(async (request: any) => {
            sent.push({ path: request.path, model: JSON.parse(request.body).model });
            const json = { id: 'm', type: 'message', role: 'assistant', content: [{ type: 'text', text: 'HELLO' }], usage: { input_tokens: 10, output_tokens: 10 } };
            return { response: { statusCode: 200, headers: {}, body: (async function* () { yield Buffer.from(JSON.stringify(json)); })() } } as any;
        });
        return sent;
    }

    it('a configured model whose name contains "/" is used as is', async () => {
        const sent = nativeBedrock();
        const res = await post('/v1/messages', 'team/claude', 'user-key');
        expect(res.status).toBe(200);
        expect(res.json.content).toEqual([{ type: 'text', text: 'HELLO' }]);
        expect(sent).toEqual([{ path: '/anthropic/v1/messages', model: 'test.claude-v1:0' }]);
    });

    it('team/claude/OTHER.model:0 gets the override 400 and Bedrock is not called', async () => {
        const sent = nativeBedrock();
        const res = await post('/v1/messages', 'team/claude/OTHER.model:0', 'user-key');
        expect(res.status).toBe(400);
        expect(res.json).toEqual({ type: 'error', error: { type: 'invalid_request_error', message: MESSAGE } });
        expect(sent).toEqual([]);
    });
});

describe('without a database', () => {
    let noDbServer: Server;
    let noDbBase: string;

    beforeAll(async () => {
        const app = new Koa();
        app.use(async (ctx: any, next) => {
            ctx.logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };
            await next();
        });
        app.use(errorHandler);
        app.use(koaBody({ jsonLimit: '1mb' }));
        // No ctx.db and no ctx.cache: the built-in model list is used, as with no PGSQL_* settings.
        app.use(async (ctx: any, next) => {
            ctx.user = { id: -1, api_key: 'admin-key', role: 'admin', month_fee: '0', month_quota: '1', updated_at: new Date() };
            await next();
        });
        const router = new Router();
        for (const [route, handler] of routes) router.post(route, handler);
        app.use(router.routes());
        noDbServer = http.createServer(app.callback());
        await new Promise<void>((resolve) => noDbServer.listen(0, '127.0.0.1', resolve));
        noDbBase = `http://127.0.0.1:${(noDbServer.address() as AddressInfo).port}`;
    });
    afterAll(async () => {
        noDbServer.closeAllConnections();
        await new Promise((resolve) => noDbServer.close(resolve));
    });

    const postNoDb = async (path: string, model: string) => {
        const body = path === '/v1/messages'
            ? { model, max_tokens: 100, messages: [{ role: 'user', content: 'hi' }] }
            : { model, stream: false, messages: [{ role: 'user', content: 'hi' }] };
        const res = await fetch(noDbBase + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
        return { status: res.status, json: JSON.parse(await res.text()) };
    };

    it.each(['/v1/chat/completions', '/v1/completions'])('%s: x/y gets the same 400 as with a database and Bedrock is not called', async (route) => {
        const res = await postNoDb(route, 'x/y');
        expect(res.status).toBe(400);
        expect(res.json).toMatchObject({ success: false, data: MESSAGE });
        expect(modelIds).toEqual([]);
    });

    it('/v1/messages: x/y gets the Anthropic 400 and Bedrock is not called', async () => {
        const res = await postNoDb('/v1/messages', 'x/y');
        expect(res.status).toBe(400);
        expect(res.json).toEqual({ type: 'error', error: { type: 'invalid_request_error', message: MESSAGE } });
        expect(modelIds).toEqual([]);
    });

    it('a built-in model name still works', async () => {
        const res = await postNoDb('/v1/chat/completions', 'amazon-nova-lite');
        expect(res.status).toBe(200);
        expect(modelIds).toEqual(['amazon.nova-lite-v1:0']);
    });
});
