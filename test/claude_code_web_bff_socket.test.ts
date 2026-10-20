import http from 'http';
import net from 'net';
import Koa from 'koa';
import { koaBody } from 'koa-body';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deps, invocations } from '../src/controller/runtime/claude_code_web';
import { errorHandler } from '../src/middleware/handlers';

const original = { ...deps };
let server: http.Server;
let port: number;
let invoke: ReturnType<typeof vi.fn>;
let bodies: any[];
let statuses: number[];
let logs: any[];

async function until(cond: () => boolean, ms = 3000) {
    const end = Date.now() + ms;
    while (!cond()) {
        if (Date.now() > end) throw new Error('timeout');
        await new Promise((r) => setTimeout(r, 10));
    }
}

beforeEach(async () => {
    bodies = [];
    statuses = [];
    logs = [];
    Object.assign(deps, {
        loadCcConfig: async () => ({ runtimeArn: 'a', workspaceRoleArn: 'r', bucket: 'b', prefix: 'p' }),
        getWorkspaceCredentials: async () => ({ accessKeyId: 'i', secretAccessKey: 's', sessionToken: 't', expiration: new Date() }),
        hasRuntimeAnthropicModel: async () => true,
        checkFee: async () => {},
    });
    const app = new Koa();
    // Same order as src/index.ts: logger, errorHandler, body parser, handler.
    app.use(async (ctx: any, next: any) => {
        const log = (...a: any[]) => logs.push(a);
        ctx.logger = { error: log, warn: log, info: log, debug: log };
        await next();
    });
    app.use(errorHandler);
    app.use(koaBody());
    app.use(async (ctx: any) => {
        ctx.user = { id: 42, group_id: 1, api_key: 'k' };
        await invocations(ctx);
        statuses.push(ctx.status);
        bodies.push(ctx.body);
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

function send(): http.ClientRequest {
    const req = http.request({ host: '127.0.0.1', port, method: 'POST', path: '/', headers: { 'content-type': 'application/json' } });
    req.on('error', () => {});
    req.write('{"a":1}');
    req.end();
    return req;
}

// Waits for the response headers however long body parsing and the handler take; until() fails if they never come.
async function post(): Promise<{ req: http.ClientRequest; res: http.IncomingMessage }> {
    let res: http.IncomingMessage | undefined;
    const req = send();
    req.on('response', (r) => (res = r));
    await until(() => res !== undefined);
    return { req, res: res! };
}

// For tests where the client leaves before any response headers: resolves right after the request was flushed.
function postWithoutResponse(): Promise<http.ClientRequest> {
    return new Promise((resolve) => {
        const req = send();
        req.on('finish', () => setTimeout(() => resolve(req), 50));
    });
}

describe('non-stream bodies on a real socket', () => {
    it('passes binary bytes through unchanged with their content type', async () => {
        const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0xfe]);
        deps.invokeRuntime = vi.fn(async () => new Response(png, { status: 200, headers: { 'content-type': 'image/png' } })) as any;
        const { res } = await post();
        const chunks: Buffer[] = [];
        for await (const c of res) chunks.push(c as Buffer);
        expect(res.statusCode).toBe(200);
        expect(res.headers['content-type']).toBe('image/png');
        expect(Buffer.compare(Buffer.concat(chunks), png)).toBe(0);
    });
});

describe('upstream stream stops early on a real socket', () => {
    async function readAll(res: http.IncomingMessage): Promise<string> {
        let text = '';
        for await (const c of res) text += c.toString();
        return text;
    }

    it('ends the browser response with an error event when the upstream body fails mid-stream', async () => {
        let upstream!: ReadableStreamDefaultController;
        const body = new ReadableStream({ start(c) { upstream = c; c.enqueue(new TextEncoder().encode('data: {"a":1}\n\n')); } });
        deps.invokeRuntime = vi.fn(async () => new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })) as any;
        const { res } = await post();
        const text = readAll(res);
        await until(() => bodies.length === 1);
        upstream.error(Object.assign(new TypeError('terminated'), { cause: { code: 'UND_ERR_SOCKET' } }));
        expect(await text).toBe('data: {"a":1}\n\n\n\ndata: {"type":"error","error":"upstream closed"}\n\n');
        expect(logs.map((l) => l[0].message)).toEqual(['claude-code-web runtime stream stopped early']);
        expect(JSON.stringify(logs)).not.toContain('terminated');
    });
});

describe('client disconnect on a real socket', () => {
    it('aborts the upstream request when the client leaves before upstream headers', async () => {
        let signal!: AbortSignal;
        invoke = vi.fn((_c: any, o: any) => { signal = o.signal; return new Promise(() => {}); });
        deps.invokeRuntime = invoke as any;
        const req = await postWithoutResponse();
        await until(() => invoke.mock.calls.length > 0);
        expect(signal.aborted).toBe(false);
        req.destroy();
        await until(() => signal.aborted);
    });

    it('destroys the keepalive output when the client leaves mid-stream', async () => {
        const body = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('data: x\n\n')); } });
        invoke = vi.fn(async () => new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } }));
        deps.invokeRuntime = invoke as any;
        const { req, res } = await post();
        expect(res).toBeTruthy();
        await until(() => bodies.length === 1);
        const signal: AbortSignal = invoke.mock.calls[0][1].signal;
        expect(bodies[0].destroyed).toBe(false);
        req.destroy();
        await until(() => signal.aborted && bodies[0].destroyed);
    });

    // Real fetch rejects with an AbortError when its signal fires.
    const abortError = () => Object.assign(new Error('This operation was aborted'), { name: 'AbortError' });

    it('stays quiet when invokeRuntime rejects with AbortError after the client left', async () => {
        let signal!: AbortSignal;
        invoke = vi.fn((_c: any, o: any) => new Promise((_res, rej) => {
            signal = o.signal;
            o.signal.addEventListener('abort', () => rej(abortError()));
        }));
        deps.invokeRuntime = invoke as any;
        const req = await postWithoutResponse();
        await until(() => invoke.mock.calls.length > 0);
        req.destroy();
        await until(() => signal.aborted);
        await new Promise((r) => setTimeout(r, 100));
        expect(JSON.stringify(logs)).not.toMatch(/unreachable/);
        expect(logs).toEqual([]);
        expect(statuses).not.toContain(502);
    });

    it('stays quiet when the client leaves while a non-stream body is being read', async () => {
        let signal!: AbortSignal;
        invoke = vi.fn(async (_c: any, o: any) => {
            signal = o.signal;
            const body = new ReadableStream({
                start(c) { o.signal.addEventListener('abort', () => c.error(abortError())); },
            });
            return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
        });
        deps.invokeRuntime = invoke as any;
        const req = await postWithoutResponse();
        await until(() => invoke.mock.calls.length > 0);
        req.destroy();
        await until(() => signal.aborted);
        await new Promise((r) => setTimeout(r, 100));
        expect(logs).toEqual([]);
        expect(statuses).not.toContain(502);
    });
});
