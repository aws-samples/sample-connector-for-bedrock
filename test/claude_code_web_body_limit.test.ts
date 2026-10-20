import http from 'http';
import net from 'net';
import Koa from 'koa';
import { koaBody } from 'koa-body';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deps, invocations, stopSession } from '../src/controller/runtime/claude_code_web';
import { errorHandler } from '../src/middleware/handlers';
import { CC_API_BODY_LIMIT, ccBodyLimit } from '../src/middleware/claude_code_web_body';

const MiB = 1024 * 1024;
const TOO_LARGE = { error: 'request body is over the 8 MiB limit', detail: 'request body is over the 8 MiB limit' };

const original = { ...deps };
let server: http.Server;
let port: number;
let seen: { path: string; body: any }[];

beforeEach(async () => {
    seen = [];
    Object.assign(deps, {
        loadCcConfig: vi.fn(async () => ({ runtimeArn: 'a', workspaceRoleArn: 'r', bucket: 'b', prefix: 'p' })),
        getWorkspaceCredentials: vi.fn(async () => ({ accessKeyId: 'i', secretAccessKey: 's', sessionToken: 't', expiration: new Date() })),
        invokeRuntime: vi.fn(async () => new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } })),
        stopRuntimeSession: vi.fn(async () => ({ status: 200, body: '{"stopped":true}' })),
        hasRuntimeAnthropicModel: vi.fn(async () => true),
        checkFee: vi.fn(async () => {}),
    });
    const app = new Koa();
    // Same order and global parser options as src/index.ts.
    app.use(async (ctx: any, next: any) => {
        const log = () => {};
        ctx.logger = { error: log, warn: log, info: log, debug: log };
        await next();
    });
    app.use(errorHandler);
    app.use(ccBodyLimit(koaBody({ multipart: true, encoding: 'utf-8', formLimit: '100mb', jsonLimit: '100mb' })));
    app.use(async (ctx: any) => {
        ctx.user = { id: 42, group_id: 1, api_key: 'k' };
        const path = ctx.path.toLowerCase();
        if (path === '/cc/api/invocations') return invocations(ctx);
        if (path === '/cc/api/stopruntimesession') return stopSession(ctx);
        seen.push({ path: ctx.path, body: ctx.request.body });
        ctx.body = { ok: true };
    });
    server = http.createServer(app.callback());
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    port = (server.address() as net.AddressInfo).port;
});
afterEach(async () => {
    Object.assign(deps, original);
    server.closeAllConnections?.();
    await new Promise((r) => server.close(r));
});

// A JSON body of exactly `bytes` bytes.
function jsonOfSize(bytes: number): string {
    return '{"a":"' + 'x'.repeat(bytes - 8) + '"}';
}

// chunked: no Content-Length, so only the parser's byte count can stop the body.
function post(path: string, body: string, opts: { chunked?: boolean; type?: string } = {}): Promise<{ status: number; json: any }> {
    return new Promise((resolve, reject) => {
        const headers: Record<string, string | number> = { 'content-type': opts.type ?? 'application/json' };
        if (!opts.chunked) headers['content-length'] = Buffer.byteLength(body);
        const req = http.request({ host: '127.0.0.1', port, method: 'POST', path, headers }, (res) => {
            let text = '';
            res.on('data', (c) => (text += c));
            res.on('end', () => resolve({ status: res.statusCode!, json: JSON.parse(text) }));
        });
        req.on('error', reject);
        req.end(body);
    });
}

function expectNoUpstreamCall() {
    expect(deps.loadCcConfig).not.toHaveBeenCalled();
    expect(deps.getWorkspaceCredentials).not.toHaveBeenCalled();
    expect(deps.invokeRuntime).not.toHaveBeenCalled();
    expect(deps.stopRuntimeSession).not.toHaveBeenCalled();
}

describe('/cc/api body limit', () => {
    it('is 8 MiB', () => {
        expect(CC_API_BODY_LIMIT).toBe(8 * MiB);
    });

    it.each(['/cc/api/invocations', '/cc/api/stopruntimesession', '/CC/API/Invocations'])(
        'answers 413 with the BFF error shape for a body one byte over the limit on %s, with no upstream call',
        async (path) => {
            const res = await post(path, jsonOfSize(8 * MiB + 1));
            expect(res.status).toBe(413);
            expect(res.json).toEqual(TOO_LARGE);
            expectNoUpstreamCall();
        },
    );

    it('answers 413 for an oversized chunked body without a Content-Length', async () => {
        const res = await post('/cc/api/invocations', jsonOfSize(9 * MiB), { chunked: true });
        expect(res.status).toBe(413);
        expect(res.json).toEqual(TOO_LARGE);
        expectNoUpstreamCall();
    });

    it('answers 413 for an oversized body of a type the parser does not read', async () => {
        const res = await post('/cc/api/invocations', 'x'.repeat(8 * MiB + 1), { type: 'application/octet-stream' });
        expect(res.status).toBe(413);
        expect(res.json).toEqual(TOO_LARGE);
        expectNoUpstreamCall();
    });

    it('forwards a body of exactly the limit unchanged', async () => {
        const body = jsonOfSize(8 * MiB);
        const res = await post('/cc/api/invocations', body);
        expect(res.status).toBe(200);
        expect(res.json).toEqual({ ok: true });
        expect(deps.invokeRuntime).toHaveBeenCalledTimes(1);
        expect((deps.invokeRuntime as any).mock.calls[0][1].body).toBe(body);
    });

    it('leaves other routes on the global parser and its limit', async () => {
        const body = jsonOfSize(9 * MiB);
        const res = await post('/v1/messages', body);
        expect(res.status).toBe(200);
        expect(seen).toHaveLength(1);
        expect(seen[0].body.a).toHaveLength(9 * MiB - 8);
    });
});
