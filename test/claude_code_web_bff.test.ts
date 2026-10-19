import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deps, invocations, stopSession } from '../src/controller/runtime/claude_code_web';
import { authHandler } from '../src/middleware/handlers';
import {
    CC_HEADER_API_KEY,
    CC_HEADER_AWS_ACCESS_KEY_ID,
    CC_HEADER_AWS_SECRET_ACCESS_KEY,
    CC_HEADER_AWS_SESSION_TOKEN,
} from '../src/claude_code_web/constants';

const KEY = 'sk-secret-key-value';
const CREDS = { accessKeyId: 'ASIAFAKEID', secretAccessKey: 'fake-secret-access', sessionToken: 'fake-session-token', expiration: new Date() };
const CONFIG = { runtimeArn: 'arn:aws:bedrock-agentcore:us-east-1:1:runtime/x', workspaceRoleArn: 'r', bucket: 'b', prefix: 'p' };

function makeCtx(over: any = {}) {
    const logs: any[] = [];
    const log = (...a: any[]) => logs.push(a);
    const ctx: any = {
        user: { id: 42, group_id: 1, api_key: KEY },
        db: {},
        request: { body: { prompt: 'hi' } },
        headers: { 'x-amzn-bedrock-agentcore-runtime-session-id': 'brc-key-0000000000000007@workspace' },
        req: new EventEmitter(),
        res: Object.assign(new EventEmitter(), { writableFinished: false }),
        logger: { error: log, info: log, warn: log, debug: log },
        logs,
        set(k: string, v: string) { (this.headers2 ??= {})[k] = v; },
        ...over,
    };
    return ctx;
}

const original = { ...deps };
let invoke: ReturnType<typeof vi.fn>;
beforeEach(() => {
    invoke = vi.fn(async () => new Response('{"ok":true}', { status: 201, headers: { 'content-type': 'application/json' } }));
    Object.assign(deps, {
        loadCcConfig: async () => CONFIG,
        getWorkspaceCredentials: async () => CREDS,
        invokeRuntime: invoke,
        stopRuntimeSession: vi.fn(async () => ({ status: 200, body: '{"stopped":true}' })),
        hasRuntimeAnthropicModel: async () => true,
        checkFee: async () => {},
    });
});
afterEach(() => Object.assign(deps, original));

describe('invocations', () => {
    it('answers 404 when not configured, with no upstream call', async () => {
        deps.loadCcConfig = async () => null;
        const ctx = makeCtx();
        await invocations(ctx);
        expect(ctx.status).toBe(404);
        expect(ctx.body).toEqual({ error: 'claude-code-web is not enabled' });
        expect(invoke).not.toHaveBeenCalled();
    });

    it('rejects the admin key with 403', async () => {
        const ctx = makeCtx({ user: { id: -1, api_key: 'admin' } });
        await invocations(ctx);
        expect(ctx.status).toBe(403);
        expect(invoke).not.toHaveBeenCalled();
    });

    it('rejects a key without a runtime-anthropic model', async () => {
        deps.hasRuntimeAnthropicModel = async () => false;
        const ctx = makeCtx();
        await invocations(ctx);
        expect(ctx.status).toBe(403);
        expect(ctx.body).toEqual({ error: 'this key has no bedrock-runtime-anthropic model' });
        expect(invoke).not.toHaveBeenCalled();
    });

    it('answers 402 on a billing error, with no upstream call', async () => {
        deps.checkFee = async () => { throw Object.assign(new Error('Please recharge.'), { anthropicType: 'billing_error' }); };
        const ctx = makeCtx();
        await invocations(ctx);
        expect(ctx.status).toBe(402);
        expect(ctx.body).toEqual({ error: 'Please recharge.' });
        expect(invoke).not.toHaveBeenCalled();
    });

    it('derives the session id from the key and ignores the request header', async () => {
        await invocations(makeCtx());
        expect(invoke.mock.calls[0][1].sessionId).toBe('brc-key-0000000000000042@workspace');
    });

    it('sends the key and credentials as the four custom headers and the JSON body', async () => {
        await invocations(makeCtx());
        const opts = invoke.mock.calls[0][1];
        expect(opts.headers).toEqual({
            [CC_HEADER_API_KEY]: KEY,
            [CC_HEADER_AWS_ACCESS_KEY_ID]: CREDS.accessKeyId,
            [CC_HEADER_AWS_SECRET_ACCESS_KEY]: CREDS.secretAccessKey,
            [CC_HEADER_AWS_SESSION_TOKEN]: CREDS.sessionToken,
        });
        expect(opts.body).toBe('{"prompt":"hi"}');
    });

    it('passes through status and JSON body when not streaming', async () => {
        const ctx = makeCtx();
        await invocations(ctx);
        expect(ctx.status).toBe(201);
        expect(ctx.type).toBe('application/json');
        expect(Buffer.from(ctx.body).toString()).toBe('{"ok":true}');
    });

    it('passes non-UTF-8 bodies through byte-identical with their content type', async () => {
        const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0xfe]);
        invoke.mockResolvedValue(new Response(png, { status: 200, headers: { 'content-type': 'image/png' } }));
        const ctx = makeCtx();
        await invocations(ctx);
        expect(ctx.status).toBe(200);
        expect(ctx.type).toBe('image/png');
        expect(Buffer.isBuffer(ctx.body)).toBe(true);
        expect(Buffer.compare(ctx.body, png)).toBe(0);
    });

    it('streams text/event-stream through the keepalive wrapper', async () => {
        const payload = 'data: {"a":1}\n\ndata: {"a":2}\n\n';
        invoke.mockResolvedValue(new Response(payload, { status: 200, headers: { 'content-type': 'text/event-stream' } }));
        const ctx = makeCtx();
        await invocations(ctx);
        expect(ctx.type).toBe('text/event-stream');
        let text = '';
        for await (const c of ctx.body) text += c.toString();
        expect(text).toBe(payload);
    });

    it('aborts the upstream request and destroys the stream when the browser disconnects', async () => {
        let upstream!: ReadableStreamDefaultController;
        const body = new ReadableStream({ start(c) { upstream = c; c.enqueue(new TextEncoder().encode('data: x\n\n')); } });
        invoke.mockResolvedValue(new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } }));
        const ctx = makeCtx();
        await invocations(ctx);
        const signal: AbortSignal = invoke.mock.calls[0][1].signal;
        expect(signal.aborted).toBe(false);
        expect(ctx.body.destroyed).toBe(false);
        ctx.res.emit('close');
        expect(signal.aborted).toBe(true);
        expect(ctx.body.destroyed).toBe(true);
        void upstream;
    });

    it('does not abort when close follows a finished response', async () => {
        const ctx = makeCtx();
        await invocations(ctx);
        ctx.res.emit('finish');
        ctx.res.emit('close');
        expect(invoke.mock.calls[0][1].signal.aborted).toBe(false);
    });

    it('answers 502 on a network error', async () => {
        invoke.mockRejectedValue(new TypeError('fetch failed'));
        const ctx = makeCtx();
        await invocations(ctx);
        expect(ctx.status).toBe(502);
        expect(ctx.body).toEqual({ error: 'claude-code-web runtime unreachable' });
    });

    it('never logs the key or the credentials', async () => {
        invoke.mockRejectedValue(Object.assign(new TypeError(`fetch failed ${KEY}`), { code: 'ECONNRESET' }));
        const ctx = makeCtx();
        await invocations(ctx);
        await stopSession(makeCtx({ logger: ctx.logger, logs: ctx.logs }));
        const dump = JSON.stringify(ctx.logs);
        for (const secret of [KEY, CREDS.accessKeyId, CREDS.secretAccessKey, CREDS.sessionToken]) expect(dump).not.toContain(secret);
        expect(ctx.logs.length).toBeGreaterThan(0);
    });
});

describe('stopSession', () => {
    it('applies the same admission checks', async () => {
        deps.loadCcConfig = async () => null;
        const ctx = makeCtx();
        await stopSession(ctx);
        expect(ctx.status).toBe(404);
        expect(deps.stopRuntimeSession).not.toHaveBeenCalled();
    });

    it('maps upstream 404 to 200 no_session', async () => {
        deps.stopRuntimeSession = vi.fn(async () => ({ status: 404, body: 'nope' }));
        const ctx = makeCtx();
        await stopSession(ctx);
        expect(ctx.status).toBe(200);
        expect(ctx.body).toEqual({ status: 'no_session' });
        expect((deps.stopRuntimeSession as any).mock.calls[0][1]).toBe('brc-key-0000000000000042@workspace');
    });

    it('passes other statuses and bodies through', async () => {
        const ctx = makeCtx();
        await stopSession(ctx);
        expect(ctx.status).toBe(200);
        expect(ctx.body).toBe('{"stopped":true}');
    });
});

describe('authHandler', () => {
    it('requires an api key on /cc/api/invocations', async () => {
        const ctx: any = { path: '/cc/api/invocations', header: {} };
        await expect(authHandler(ctx, async () => {})).rejects.toThrow('Unauthorized: api key required.');
    });
});
