import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import https from 'https';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { selectAuth, postChatCompletions, errorFromResponse, readBody, BedrockHttpError } from '../src/providers/bedrock_openai/transport';
import { extractErrorDetails } from '../src/util/response';
import { HERMETIC_ENV } from './helpers/hermetic_env';

// Stands in for the request handler: records what it is given and answers with a canned response.
function captureHandler(status = 200, body = '{}', headers: Record<string, string> = {}) {
    const seen: any[] = [];
    const seenOptions: any[] = [];
    return {
        seen,
        seenOptions,
        handle: async (request: any, options?: any) => {
            seen.push(request);
            seenOptions.push(options);
            return { response: { statusCode: status, headers, body: (async function* () { yield Buffer.from(body); })() } };
        },
    };
}
const creds = (...ids: string[]) => ids.map((accessKeyId) => ({ accessKeyId, secretAccessKey: 'fake-secret' }));

describe('bedrock runtime Chat Completions transport', () => {
    beforeEach(() => { for (const [name, value] of Object.entries(HERMETIC_ENV)) vi.stubEnv(name, value); });
    afterEach(() => { vi.restoreAllMocks(); });

    it('signs with SigV4 for service bedrock in the request region', async () => {
        const h = captureHandler();
        await postChatCompletions({ region: 'us-west-2', auth: selectAuth({ credentials: creds('test-access-key-id') }), body: '{"model":"m"}' }, h);
        const r = h.seen[0];
        expect(r).toMatchObject({ method: 'POST', hostname: 'bedrock-runtime.us-west-2.amazonaws.com', path: '/openai/v1/chat/completions', body: '{"model":"m"}' });
        expect(r.headers['content-type']).toBe('application/json');
        expect(r.headers.authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=test-access-key-id\/\d{8}\/us-west-2\/bedrock\/aws4_request, /);
    });
    it('sends a configured bearer token without signing', async () => {
        const h = captureHandler();
        await postChatCompletions({ region: 'us-east-1', auth: selectAuth({ bearerToken: 'fake-key' }), body: '{}' }, h);
        expect(h.seen[0].headers.authorization).toBe('Bearer fake-key');
        expect(h.seen[0].headers['x-amz-date']).toBeUndefined();
    });
    it('skips the key that just failed when another is configured', () => {
        expect(selectAuth({ credentials: creds('test-ak-1', 'test-ak-2') }, 'test-ak-1')).toMatchObject({ kind: 'sigv4', accessKeyId: 'test-ak-2' });
        expect(selectAuth({ credentials: creds('test-ak-1') }, 'test-ak-1')).toMatchObject({ kind: 'sigv4', accessKeyId: 'test-ak-1' });
    });
    it('uses an ambient AWS_BEARER_TOKEN_BEDROCK when the model has no auth', () => {
        vi.stubEnv('AWS_BEARER_TOKEN_BEDROCK', 'ambient-key');
        expect(selectAuth({})).toMatchObject({ kind: 'bearer', token: 'ambient-key' });
    });
    it('falls back to the default credential chain', async () => {
        const h = captureHandler();
        await postChatCompletions({ region: 'us-east-1', auth: selectAuth({}), body: '{}' }, h);
        expect(h.seen[0].headers.authorization).toMatch(/Credential=fake-host-ak\//);
    });
    it('labels auth without exposing secrets', () => {
        for (const a of [selectAuth({ bearerToken: 'fake-key' }), selectAuth({ credentials: creds('test-access-key-id') })]) {
            expect(a.label).not.toContain('fake-key');
            expect(a.label).not.toContain('fake-secret');
        }
    });
    it('uses the upstream error message from a JSON error body', () => {
        const e = errorFromResponse(400, JSON.stringify({ error: { message: "Invalid value: 1. This model accepts 'top_p' only with the value 0.95." } }));
        expect(e).toMatchObject({ statusCode: 400, message: "Invalid value: 1. This model accepts 'top_p' only with the value 0.95." });
    });
    it('falls back to the text for non-JSON or empty error bodies', () => {
        expect(errorFromResponse(502, '<html>Bad gateway</html>')).toMatchObject({ statusCode: 502, message: expect.stringContaining('Bad gateway') });
        expect(errorFromResponse(503, '').message).toBe('HTTP 503');
    });
    it('readBody joins the chunks', async () => {
        expect(await readBody((async function* () { yield Buffer.from('ab'); yield Buffer.from('c'); })())).toBe('abc');
    });

    it('sends over https', async () => {
        const h = captureHandler();
        await postChatCompletions({ region: 'us-east-1', auth: selectAuth({ bearerToken: 'fake-key' }), body: '{}' }, h);
        expect(h.seen[0].protocol).toBe('https:');
    });
    it('signs the host header', async () => {
        const h = captureHandler();
        await postChatCompletions({ region: 'us-east-1', auth: selectAuth({ credentials: creds('test-access-key-id') }), body: '{}' }, h);
        expect(h.seen[0].headers.authorization).toMatch(/SignedHeaders=[^,]*\bhost\b/);
    });
    it('shares one default credential chain across calls, so its credential cache is shared too', () => {
        expect((selectAuth({}) as any).credentials).toBe((selectAuth({}) as any).credentials);
    });
    it('prefers a configured token, then configured credentials, then an ambient token', () => {
        vi.stubEnv('AWS_BEARER_TOKEN_BEDROCK', 'ambient-key');
        expect(selectAuth({ bearerToken: 'fake-key', credentials: creds('test-access-key-id') })).toMatchObject({ kind: 'bearer', token: 'fake-key' });
        expect(selectAuth({ credentials: creds('test-access-key-id') })).toMatchObject({ kind: 'sigv4', accessKeyId: 'test-access-key-id' });
    });
    it('keeps an ambient token out of the label', () => {
        vi.stubEnv('AWS_BEARER_TOKEN_BEDROCK', 'ambient-key');
        expect(selectAuth({}).label).not.toContain('ambient-key');
    });
    // The pick among the remaining keys is random, so fix it at both ends and the middle: a single call could pass by luck.
    it.each([0, 0.5, 0.99])('never picks the key that just failed (random pick %s)', (roll) => {
        vi.spyOn(Math, 'random').mockReturnValue(roll);
        const auth = selectAuth({ credentials: creds('test-ak-1', 'test-ak-2', 'test-ak-3') }, 'test-ak-2');
        expect(['test-ak-1', 'test-ak-3']).toContain((auth as any).accessKeyId);
    });

    it('hands the abort signal to the handler', async () => {
        const h = captureHandler();
        const controller = new AbortController();
        await postChatCompletions({ region: 'us-east-1', auth: selectAuth({ bearerToken: 'fake-key' }), body: '{}', abortSignal: controller.signal }, h);
        expect(h.seenOptions[0].abortSignal).toBe(controller.signal);
    });
    it('returns the upstream status, headers and body as they came, even for an error status', async () => {
        const h = captureHandler(429, '{"error":{"message":"slow down"}}', { 'x-amzn-requestid': 'req-1' });
        const res = await postChatCompletions({ region: 'us-east-1', auth: selectAuth({ bearerToken: 'fake-key' }), body: '{}' }, h);
        expect(res).toMatchObject({ statusCode: 429, headers: { 'x-amzn-requestid': 'req-1' } });
        expect(await readBody(res.body)).toBe('{"error":{"message":"slow down"}}');
    });
    it('readBody keeps a multi-byte character that is split across chunks', async () => {
        const bytes = Buffer.from('好');
        expect(await readBody((async function* () { yield bytes.subarray(0, 1); yield bytes.subarray(1); })())).toBe('好');
    });
    it('readBody accepts string chunks', async () => {
        expect(await readBody((async function* () { yield 'ab'; yield Buffer.from('c'); })())).toBe('abc');
    });
    it('readBody returns an empty string when there is no body', async () => {
        expect(await readBody(undefined)).toBe('');
    });

    it('reads the error message from error.message, then message, then Message', () => {
        expect(errorFromResponse(400, '{"error":{"message":"nested"},"message":"lower","Message":"Upper"}').message).toBe('nested');
        expect(errorFromResponse(403, '{"message":"lower","Message":"Upper"}').message).toBe('lower');
        expect(errorFromResponse(403, '{"Message":"Upper"}').message).toBe('Upper');
    });
    it('skips a blank or non-text message and uses the next one', () => {
        expect(errorFromResponse(400, '{"error":{"message":"  "},"message":"fallback"}').message).toBe('fallback');
        expect(errorFromResponse(400, '{"error":{"message":{"code":1}},"Message":"fallback"}').message).toBe('fallback');
    });
    it('bounds an oversized error page: the message keeps 500 characters and the stored body 2000', () => {
        const e = errorFromResponse(502, `  ${'x'.repeat(3000)}\n`);
        expect(e.message).toBe('x'.repeat(500));
        expect(e.body).toHaveLength(2000);
    });
    // src/util/response.ts reports $metadata.requestId as request_id, and src/middleware/handlers.ts answers with
    // $metadata.httpStatusCode ahead of statusCode, so the two must agree.
    it('carries the Bedrock request id in $metadata, with the same status', () => {
        const e = errorFromResponse(429, '{"message":"slow down"}', 'req-1');
        expect(e.$metadata).toEqual({ requestId: 'req-1', httpStatusCode: 429 });
        expect(extractErrorDetails(e)).toMatchObject({ request_id: 'req-1', http_status: 429 });
        expect(new BedrockHttpError(502, 'not JSON', undefined, 'req-2').$metadata).toEqual({ requestId: 'req-2', httpStatusCode: 502 });
    });
    it('leaves $metadata unset without a request id', () => {
        expect(errorFromResponse(429, '').$metadata).toBeUndefined();
        expect(new BedrockHttpError(400, 'bad request').$metadata).toBeUndefined();
    });
    it('returns a BedrockHttpError that keeps the upstream body for the error middleware', () => {
        const e = errorFromResponse(429, '{"message":"slow down"}');
        expect(e).toBeInstanceOf(BedrockHttpError);
        expect(e).toMatchObject({ name: 'BedrockRuntimeOpenAIError', statusCode: 429, body: '{"message":"slow down"}' });
    });

    describe('default request handler', () => {
        // The transport builds one handler per module instance, on the first request, so each case loads a fresh copy.
        // Only the handler is faked, so nothing leaves the process; the options the transport gives it are the real ones.
        async function freshTransport() {
            const built: any[] = [];
            class FakeNodeHttpHandler {
                constructor(options: any) { built.push(options); }
                async handle() { return { response: { statusCode: 200, headers: {}, body: (async function* () { yield Buffer.from('{}'); })() } }; }
            }
            vi.resetModules();
            vi.doMock('@smithy/node-http-handler', () => ({ NodeHttpHandler: FakeNodeHttpHandler }));
            // NodeNext resolves a dynamic import as ESM, which wants the extension.
            const transport = await import('../src/providers/bedrock_openai/transport.js');
            const send = () => transport.postChatCompletions({ region: 'us-east-1', auth: transport.selectAuth({ bearerToken: 'fake-key' }), body: '{}' });
            return { built, send };
        }
        afterEach(() => {
            vi.doUnmock('@smithy/node-http-handler');
            vi.resetModules();
        });

        it('sends through the proxy named by HTTPS_PROXY, ahead of HTTP_PROXY', async () => {
            const { built, send } = await freshTransport();
            vi.stubEnv('HTTPS_PROXY', 'http://https-proxy.example.test:3128');
            vi.stubEnv('HTTP_PROXY', 'http://http-proxy.example.test:3128');
            await send();
            expect(built[0].httpsAgent).toBeInstanceOf(HttpsProxyAgent);
            expect(built[0].httpsAgent.proxy.href).toBe('http://https-proxy.example.test:3128/');
        });
        it('uses HTTP_PROXY when HTTPS_PROXY is not set', async () => {
            const { built, send } = await freshTransport();
            vi.stubEnv('HTTP_PROXY', 'http://http-proxy.example.test:3128');
            await send();
            expect(built[0].httpsAgent.proxy.href).toBe('http://http-proxy.example.test:3128/');
        });
        // Left to itself NodeHttpHandler caps its agent at 50 sockets, and its connect timeout runs while a request
        // waits for one, so the 51st concurrent stream would time out.
        it('connects directly through a keep-alive agent with no socket cap when no proxy is set', async () => {
            const { built, send } = await freshTransport();
            await send();
            const agent = built[0].httpsAgent;
            expect(agent).toBeInstanceOf(https.Agent);
            expect(agent).not.toBeInstanceOf(HttpsProxyAgent);
            expect(agent.keepAlive).toBe(true);
            expect(agent.maxSockets).toBe(Infinity);
        });
        it('leaves the proxy agent without a socket cap', async () => {
            const { built, send } = await freshTransport();
            vi.stubEnv('HTTPS_PROXY', 'http://https-proxy.example.test:3128');
            await send();
            expect(built[0].httpsAgent.maxSockets).toBe(Infinity);
        });
        it('sets a connect timeout, so a dead route fails soon enough to retry', async () => {
            const { built, send } = await freshTransport();
            await send();
            expect(built[0].connectionTimeout).toBeGreaterThan(0);
        });
        it('reuses one handler for every request', async () => {
            const { built, send } = await freshTransport();
            await send();
            await send();
            expect(built).toHaveLength(1);
        });
    });
});
