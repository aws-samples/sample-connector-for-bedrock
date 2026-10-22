import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Koa from 'koa';
import { koaBody } from 'koa-body';
import Router from 'koa-router';
import fs from 'fs';
import path from 'path';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { BedrockRuntimeClient, ConverseCommand, ConverseStreamCommand, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import PGClient from '../src/util/postgres';
import { authHandler, errorHandler } from '../src/middleware/handlers';
import v1 from '../src/controller/runtime/v1';
import anthropic from '../src/controller/runtime/anthropic';
import BedrockConverse from '../src/providers/bedrock_converse';
import AzureOpenAIImage from '../src/providers/azure_openai_image';
import { MAX_SESSION_ID_LENGTH } from '../src/providers/bedrock_openai/retry';
import { HERMETIC_ENV } from './helpers/hermetic_env';

// The repo's own controllers, providers and SQL builder serve each call, on the paths src/routes.ts gives them. That
// file is not imported: it pulls in every controller, and one of them does not parse outside tsc. A test checks that
// it still has these routes. Bedrock is a stub, and the database records every statement. Like Postgres, it refuses a
// session key longer than eiai_session.key and eiai_thread.session_key hold, and it also fails any statement a test
// names.

const routes: [string, string, any][] = [
    ['/v1/chat/completions', 'v1.chat_completions', v1.chat_completions],
    ['/v1/completions', 'v1.completions', v1.completions],
    ['/v1/embeddings', 'v1.embeddings', v1.embeddings],
    ['/v1/images/generations', 'v1.images', v1.images],
    ['/v1/messages', 'anthropic.messages', anthropic.messages],
];

const FEE = 1000 * 1e-7 + 1000 * 2e-7;
const models = [
    { id: 7, name: 'converse-model', provider: 'bedrock-converse', price_in: 1e-7, price_out: 2e-7, config: { modelId: 'test.converse-v1:0', regions: ['us-east-1'] } },
    { id: 8, name: 'embed-model', provider: 'titan-embeddings', price_in: 1e-7, price_out: 0, config: { modelId: 'test.embed-v1:0', regions: ['us-east-1'] } },
    { id: 9, name: 'image-model', provider: 'azure-openai-image', price_in: 0, price_out: 0, config: { baseURL: 'https://images.invalid', apiKey: 'fake', apiVersion: '2024-01-01', model: 'img' } },
];
const key = () => ({ id: 5, api_key: 'user-key', group_id: 1, role: 'user', month_fee: '0', month_quota: '10', balance: '0', total_fee: '0', updated_at: new Date() });

type Statement = { sql: string; params: any[]; failed: boolean };

function sessionKeyTooLong(sql: string, params: any[]): boolean {
    const insert = /^INSERT into (eiai_session|eiai_thread) \(([^)]*)\)/.exec(sql);
    if (!insert) {
        return false;
    }
    const columns = insert[2].split(',').map((c) => c.trim());
    const value = params[columns.indexOf(insert[1] === 'eiai_session' ? 'key' : 'session_key')];
    return typeof value === 'string' && Array.from(value).length > MAX_SESSION_ID_LENGTH;
}

function recordingDb(failOn?: RegExp) {
    const statements: Statement[] = [];
    const db: any = new PGClient();
    db.pool = {
        query: async (text: string, params: any[] = []) => {
            const sql = text.replace(/\s+/g, ' ').trim();
            const tooLong = sessionKeyTooLong(sql, params);
            const failed = tooLong || !!failOn?.test(sql);
            statements.push({ sql, params, failed });
            if (failed) {
                throw new Error(tooLong ? 'value too long for type character varying(128)' : 'simulated database error');
            }
            if (/^select count\(\*\)/.test(sql)) return { rows: [{ ct: 1 }], rowCount: 1 };
            if (/^select \* from eiai_session/.test(sql)) return { rows: [], rowCount: 0 };
            return { rows: [{ id: 1 }], rowCount: 1 };
        },
    };
    return { db, statements };
}

async function* converseStream() {
    yield { messageStart: { role: 'assistant' } };
    yield { contentBlockDelta: { contentBlockIndex: 0, delta: { text: 'HELLO' } } };
    yield { messageStop: { stopReason: 'end_turn' } };
    yield { metadata: { usage: { inputTokens: 1000, outputTokens: 1000 }, metrics: { latencyMs: 5 } } };
}

// Each Bedrock or image upstream call, by command name.
const upstream: string[] = [];
// handled counts the requests the app has finished with, closed the responses that have closed. onWrite and onEnd,
// when a test sets them, see each chunk the app writes and the moment it ends the response.
let state: {
    db: any; statements: Statement[]; logger: any; handled: number; closed: number;
    onWrite?: (chunk: any) => void; onEnd?: () => void;
};

let server: Server;
let base: string;

beforeAll(() => {
    const app = new Koa();
    app.use(async (ctx: any, next) => {
        ctx.logger = state.logger;
        ctx.res.once('close', () => state.closed++);
        const { write, end } = ctx.res;
        ctx.res.write = function (...args: any[]) {
            state.onWrite?.(args[0]);
            return write.apply(this, args);
        };
        ctx.res.end = function (...args: any[]) {
            state.onEnd?.();
            return end.apply(this, args);
        };
        try {
            await next();
        } finally {
            state.handled++;
        }
    });
    app.use(errorHandler);
    app.use(koaBody({ jsonLimit: '1mb' }));
    app.use(async (ctx: any, next) => {
        ctx.db = state.db;
        ctx.cache = { api_keys: [key()], models, connectors: [] };
        ctx.performanceMode = false;
        await next();
    });
    app.use(authHandler);
    const router = new Router();
    for (const [route, , handler] of routes) {
        router.post(route, handler);
    }
    app.use(router.routes());
    server = app.listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => {
    server.close();
});

beforeEach(() => {
    for (const [name, value] of Object.entries(HERMETIC_ENV)) vi.stubEnv(name, value);
    upstream.length = 0;
    state = { ...recordingDb(), logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }, handled: 0, closed: 0 };
    vi.spyOn(BedrockRuntimeClient.prototype as any, 'send').mockImplementation(async (command: any) => {
        upstream.push(command.constructor.name);
        if (command instanceof ConverseStreamCommand) {
            return { stream: converseStream() };
        }
        if (command instanceof ConverseCommand) {
            return {
                output: { message: { role: 'assistant', content: [{ text: 'HELLO' }] } },
                usage: { inputTokens: 1000, outputTokens: 1000, totalTokens: 2000 },
                metrics: { latencyMs: 5 },
                stopReason: 'end_turn',
                $metadata: { requestId: 'req-1' },
            };
        }
        if (command instanceof InvokeModelCommand) {
            return { body: new TextEncoder().encode(JSON.stringify({ embedding: [0.1], inputTextTokenCount: 1000 })) };
        }
        throw new Error(`unexpected command ${command.constructor.name}`);
    });
    vi.spyOn(AzureOpenAIImage.prototype, 'images').mockImplementation(async (_request: any, _session: any, ctx: any) => {
        upstream.push('images.generate');
        ctx.body = { data: [] };
    });
});
afterEach(() => {
    vi.restoreAllMocks();
});

function useDb(failOn?: RegExp) {
    Object.assign(state, recordingDb(failOn));
}

async function post(path: string, body: any, sessionId?: string) {
    const headers: Record<string, string> = { 'content-type': 'application/json', authorization: 'Bearer user-key' };
    if (sessionId !== undefined) {
        headers['session-id'] = sessionId;
    }
    const res = await fetch(base + path, { method: 'POST', headers, body: JSON.stringify(body) });
    return { status: res.status, text: await res.text() };
}

const messages = [{ role: 'user', content: 'hi' }];
const chatStream = { model: 'converse-model', stream: true, messages };
const chatSync = { model: 'converse-model', stream: false, messages };
const hellos = (text: string) => (text.match(/HELLO/g) || []).length;
const charges = () => state.statements.filter((s) => /^update eiai_key\b/i.test(s.sql));
const chargedFee = (s: Statement) => s.params.some((p) => typeof p === 'number' && Math.abs(p - FEE) < 1e-12);

// Answers every Bedrock call in this test with a new response from answer().
function bedrockAnswers(answer: () => any) {
    (BedrockRuntimeClient.prototype.send as any).mockImplementation(async (command: any) => {
        upstream.push(command.constructor.name);
        return answer();
    });
}

it('src/routes.ts still serves the routes this file mirrors', () => {
    const source = fs.readFileSync(path.join(__dirname, '../src/routes.ts'), 'utf8');
    for (const [route, handler] of routes) {
        expect(source).toContain(`router.post("${route}", ${handler});`);
    }
});

describe('Session-Id length', () => {
    const tooLong = 'x'.repeat(MAX_SESSION_ID_LENGTH + 1);

    it.each([
        ['/v1/chat/completions (stream)', '/v1/chat/completions', chatStream],
        ['/v1/chat/completions', '/v1/chat/completions', chatSync],
        ['/v1/completions', '/v1/completions', chatSync],
        ['/v1/embeddings', '/v1/embeddings', { model: 'embed-model', input: 'hi' }],
        ['/v1/images/generations', '/v1/images/generations', { model: 'image-model', prompt: 'a cat' }],
    ])('%s refuses a 129-character Session-Id with 400 before any upstream call', async (_name, path, body) => {
        const res = await post(path, body, tooLong);
        expect(res.status).toBe(400);
        expect(JSON.parse(res.text)).toMatchObject({ success: false, data: 'Session-Id must be at most 128 characters.' });
        expect(upstream).toEqual([]);
        expect(charges()).toEqual([]);
    });

    it('/v1/messages on a converse model refuses it with an Anthropic invalid_request_error', async () => {
        const res = await post('/v1/messages', { model: 'converse-model', max_tokens: 100, stream: true, messages }, tooLong);
        expect(res.status).toBe(400);
        expect(JSON.parse(res.text)).toEqual({ type: 'error', error: { type: 'invalid_request_error', message: 'Session-Id must be at most 128 characters.' } });
        expect(upstream).toEqual([]);
    });

    it('accepts a 128-character Session-Id and saves it with the call', async () => {
        const id = 'x'.repeat(MAX_SESSION_ID_LENGTH);
        const res = await post('/v1/chat/completions', chatStream, id);
        expect(res.status).toBe(200);
        expect(upstream).toEqual(['ConverseStreamCommand']);
        expect(state.statements.filter((s) => s.failed)).toEqual([]);
        expect(state.statements.some((s) => /^INSERT into eiai_session/.test(s.sql) && s.params.includes(id))).toBe(true);
        expect(charges().filter(chargedFee)).toHaveLength(1);
    });
});

describe('a call is charged even when its history cannot be saved', () => {
    it.each([
        ['session', /^INSERT into eiai_session/],
        ['thread', /^INSERT into eiai_thread/],
    ])('a streamed converse call whose %s insert fails is charged once and answered once', async (_name, failOn) => {
        useDb(failOn);
        const res = await post('/v1/chat/completions', chatStream, 's1');
        expect(res.status).toBe(200);
        expect(hellos(res.text)).toBe(1);
        expect(res.text.trimEnd().endsWith('data: [DONE]')).toBe(true);
        expect(upstream).toEqual(['ConverseStreamCommand']);
        expect(charges()).toHaveLength(1);
        expect(chargedFee(charges()[0])).toBe(true);
        expect(state.logger.error).toHaveBeenCalledWith(expect.objectContaining({ error: 'simulated database error' }));
    });

    it('a non-stream converse call whose session insert fails is charged and still gets its answer', async () => {
        useDb(/^INSERT into eiai_session/);
        const res = await post('/v1/chat/completions', chatSync, 's1');
        expect(res.status).toBe(200);
        expect(JSON.parse(res.text).choices[0].message.content).toBe('HELLO');
        expect(upstream).toEqual(['ConverseCommand']);
        expect(charges()).toHaveLength(1);
        expect(chargedFee(charges()[0])).toBe(true);
    });

    it('charges the key before it writes the session and the thread', async () => {
        await post('/v1/chat/completions', chatStream, 's1');
        const order = state.statements.map((s) => s.sql);
        const charge = order.findIndex((sql) => /^update eiai_key\b/i.test(sql));
        const session = order.findIndex((sql) => /^INSERT into eiai_session/.test(sql));
        const thread = order.findIndex((sql) => /^INSERT into eiai_thread/.test(sql));
        expect(charge).toBeGreaterThanOrEqual(0);
        expect(session).toBeGreaterThan(charge);
        expect(thread).toBeGreaterThan(session);
    });

    it('an embeddings call whose thread insert fails is charged and still gets its answer', async () => {
        useDb(/^INSERT into eiai_thread/);
        const res = await post('/v1/embeddings', { model: 'embed-model', input: 'hi' }, 's1');
        expect(res.status).toBe(200);
        expect(JSON.parse(res.text).data).toHaveLength(1);
        expect(upstream).toEqual(['InvokeModelCommand']);
        expect(charges()).toHaveLength(1);
        expect(charges()[0].params).toContain(1000 * 1e-7);
    });
});

describe('bedrock-converse retries only what Bedrock fails', () => {
    it('a stream whose recording throws makes one Bedrock call and streams the answer once, to the end', async () => {
        vi.spyOn(BedrockConverse.prototype, 'saveThread').mockRejectedValue(new Error('recording failed'));
        const res = await post('/v1/chat/completions', chatStream, 's1');
        expect(upstream).toEqual(['ConverseStreamCommand']);
        expect(hellos(res.text)).toBe(1);
        expect(res.text.trimEnd().endsWith('data: [DONE]')).toBe(true);
        expect(state.logger.error).toHaveBeenCalledWith(expect.objectContaining({ message: 'bedrock-converse could not record the call', error: 'recording failed' }));
    });

    it('a non-stream call whose recording throws makes one Bedrock call and still gets its answer', async () => {
        vi.spyOn(BedrockConverse.prototype, 'saveThread').mockRejectedValue(new Error('recording failed'));
        const res = await post('/v1/chat/completions', chatSync, 's1');
        expect(upstream).toEqual(['ConverseCommand']);
        expect(res.status).toBe(200);
        expect(JSON.parse(res.text).choices[0].message.content).toBe('HELLO');
    });

    it('a non-stream answer with a redacted reasoning block is fetched once, charged once and answered', async () => {
        bedrockAnswers(() => ({
            output: { message: { role: 'assistant', content: [{ reasoningContent: { redactedContent: new Uint8Array([1, 2, 3]) } }, { text: 'HELLO' }] } },
            usage: { inputTokens: 1000, outputTokens: 1000, totalTokens: 2000 },
            metrics: { latencyMs: 5 },
            stopReason: 'end_turn',
            $metadata: { requestId: 'req-1' },
        }));
        const res = await post('/v1/chat/completions', chatSync, 's1');
        expect(upstream).toEqual(['ConverseCommand']);
        expect(charges()).toHaveLength(1);
        expect(chargedFee(charges()[0])).toBe(true);
        expect(res.status).toBe(200);
        expect(JSON.parse(res.text).choices[0].message.content).toBe('HELLO');
    });

    it('a stream whose client leaves after the first delta makes one Bedrock call and is charged once', async () => {
        let release!: () => void;
        const rest = new Promise<void>((resolve) => { release = resolve; });
        bedrockAnswers(() => ({
            stream: (async function* () {
                yield { contentBlockDelta: { contentBlockIndex: 0, delta: { text: 'HELLO' } } };
                await rest;
                yield { contentBlockDelta: { contentBlockIndex: 0, delta: { text: ' AGAIN' } } };
                yield { messageStop: { stopReason: 'end_turn' } };
                yield { metadata: { usage: { inputTokens: 1000, outputTokens: 1000 }, metrics: { latencyMs: 5 } } };
            })(),
        }));
        const client = new AbortController();
        const res = await fetch(`${base}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: 'Bearer user-key', 'session-id': 's1' },
            body: JSON.stringify(chatStream),
            signal: client.signal,
        });
        const reader = res.body!.getReader();
        let seen = '';
        while (!seen.includes('HELLO')) {
            const { value } = await reader.read();
            seen += new TextDecoder().decode(value);
        }
        client.abort();
        await vi.waitFor(() => expect(state.closed).toBe(1));
        release();
        await vi.waitFor(() => expect(state.handled).toBe(1));
        expect(upstream).toEqual(['ConverseStreamCommand']);
        expect(charges()).toHaveLength(1);
        expect(chargedFee(charges()[0])).toBe(true);
    });

    it('still retries a Bedrock error and records only the call that succeeded', async () => {
        (BedrockRuntimeClient.prototype.send as any).mockImplementationOnce(async (command: any) => {
            upstream.push(command.constructor.name);
            throw Object.assign(new Error('throttled'), { name: 'ThrottlingException' });
        });
        const res = await post('/v1/chat/completions', chatStream, 's1');
        expect(upstream).toEqual(['ConverseStreamCommand', 'ConverseStreamCommand']);
        expect(hellos(res.text)).toBe(1);
        expect(res.text.match(/data: \[DONE\]/g)).toHaveLength(1);
        expect(charges()).toHaveLength(1);
        expect(state.statements.filter((s) => /^INSERT into eiai_thread/.test(s.sql))).toHaveLength(1);
    });
});

describe('the converted /v1/messages stream', () => {
    const messagesStream = { model: 'converse-model', max_tokens: 100, stream: true, messages };

    it('is charged before message_stop is written and the response ends', async () => {
        const chargedAt: { stop?: number; end?: number } = {};
        state.onWrite = (chunk) => {
            if (chargedAt.stop === undefined && String(chunk).includes('message_stop')) chargedAt.stop = charges().length;
        };
        state.onEnd = () => {
            if (chargedAt.end === undefined) chargedAt.end = charges().length;
        };
        const res = await post('/v1/messages', messagesStream, 's1');
        expect(res.status).toBe(200);
        expect(res.text).toContain('message_stop');
        expect(chargedAt).toEqual({ stop: 1, end: 1 });
        expect(charges().filter(chargedFee)).toHaveLength(1);
    });

    it('still ends with message_stop when the recording throws, and logs it', async () => {
        vi.spyOn(BedrockConverse.prototype, 'saveThread').mockRejectedValue(new Error('recording failed'));
        const res = await post('/v1/messages', messagesStream, 's1');
        expect(res.status).toBe(200);
        expect(upstream).toEqual(['ConverseStreamCommand']);
        expect(hellos(res.text)).toBe(1);
        expect(res.text).toContain('message_stop');
        expect(state.logger.error).toHaveBeenCalledWith(expect.objectContaining({ message: 'bedrock-converse could not record the call', error: 'recording failed' }));
    });
});
