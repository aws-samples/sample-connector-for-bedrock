import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import BedrockRuntimeOpenAI from '../src/providers/bedrock_runtime_openai';
import { fakeDb } from './helpers/fakes';
import { HERMETIC_ENV } from './helpers/hermetic_env';

const model = (over: any = {}) => ({ id: 5, name: 'kimi-k3', provider: 'bedrock-runtime-openai', multiple: 1, model_type: 1, price_in: 3e-6, price_out: 15e-6,
    config: { modelId: 'global.moonshotai.kimi-k3', regions: ['us-east-1'], price_cache_read: 0.3e-6, credentials: [{ accessKeyId: 'test-ak-1', secretAccessKey: 'fake-secret' }] }, ...over });
const USAGE = { prompt_tokens: 2916, completion_tokens: 10, prompt_tokens_details: { cached_tokens: 2891, cache_write_tokens: 0 } };
const completion = { id: 'c1', object: 'chat.completion', choices: [{ index: 0, message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }], usage: USAGE };
const ev = (o: any) => `data: ${JSON.stringify(o)}\n\n`;
const content = (t: string) => ev({ id: 'c1', object: 'chat.completion.chunk', choices: [{ index: 0, delta: { content: t } }] });
const usageChunk = ev({ id: 'c1', object: 'chat.completion.chunk', choices: [], usage: USAGE });
const DONE = 'data: [DONE]\n\n';
const request = (extra: any = {}) => ({ model: 'kimi-k3', currency: 'USD', price_in: 3e-6, price_out: 15e-6, messages: [{ role: 'user', content: 'hi' }], ...extra });
const signedKey = (authorization: string) => /Credential=([^/]+)\//.exec(authorization)?.[1];

type Reply = { status: number; body?: string; chunks?: string[]; delayMs?: number };
function stubHandler(replies: Reply[]) {
    const seen: any[] = [];
    return { seen, handle: async (request: any) => {
        seen.push({ request, json: JSON.parse(request.body), authorization: request.headers.authorization });
        const r = replies.shift()!;
        if (r.delayMs) await new Promise((ok) => setTimeout(ok, r.delayMs));
        const parts = r.chunks ?? [r.body ?? ''];
        async function* body() {
            for (const p of parts) {
                yield Buffer.from(p);
            }
        }
        return { response: { statusCode: r.status, headers: {}, body: body() } };
    } };
}
function fakeCtx(modelData: any) {
    const res: any = new EventEmitter();
    res.chunks = [] as string[];
    res.writableEnded = false;
    res.write = (s: string) => { if (res.writableEnded) throw new Error('write after end'); res.chunks.push(String(s)); return true; };
    res.end = () => { res.writableEnded = true; res.emit('close'); };
    const responseHeaders: Record<string, string> = {};
    return { state: { modelData }, user: { id: 7, month_fee: '0', month_quota: '10', balance: '0', total_fee: '0' }, db: fakeDb(), headers: {}, res, status: 404, body: undefined as any, responseHeaders,
        set(k: any, v?: any) { if (typeof k === 'string') responseHeaders[k] = v; else Object.assign(responseHeaders, k); },
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } } as any;
}
const thread = (ctx: any) => ctx.db.calls.find((c: any[]) => c[0] === 'insert')?.[2];

// Some cases need a call that fails before any response, a client that leaves mid-call, or a look at what the
// provider did between two calls, so each step of this handler is a function.
type Step = (options?: { abortSignal?: AbortSignal }) => Promise<any>;
function scriptedHandler(steps: Step[]) {
    const seen: any[] = [];
    return { seen, handle: async (request: any, options?: { abortSignal?: AbortSignal }) => {
        seen.push({ request, json: JSON.parse(request.body), authorization: request.headers.authorization });
        return steps.shift()!(options);
    } };
}
// Answers the way the real handler does: once the call is aborted, the body fails instead of yielding more.
const reply = (status: number, ...chunks: string[]): Step => async (options) =>
    ({ response: { statusCode: status, headers: {}, body: (async function* () {
        for (const c of chunks) {
            if (options?.abortSignal?.aborted) throw Object.assign(new Error('Request aborted'), { name: 'AbortError' });
            yield Buffer.from(c);
        }
    })() } });
const rejectWith = (error: any): Step => async () => { throw error; };
const withConfig = (config: any) => model({ config: { ...model().config, ...config } });
const twoKeys = [{ accessKeyId: 'test-ak-1', secretAccessKey: 'fake-secret' }, { accessKeyId: 'test-ak-2', secretAccessKey: 'fake-secret' }];
const okBody = JSON.stringify(completion);

describe('bedrock-runtime-openai provider', () => {
    // Every model here has its own keys, so the host's credential chain should never be reached; if it is, it finds only fakes.
    beforeEach(() => { for (const [name, value] of Object.entries(HERMETIC_ENV)) vi.stubEnv(name, value); });

    it("non-stream: returns Bedrock's JSON and bills the usage", async () => {
        const handler = stubHandler([{ status: 200, body: JSON.stringify(completion) }]);
        const ctx = fakeCtx(model());
        await new BedrockRuntimeOpenAI(handler).chat(request(), '', ctx);
        expect(ctx.status).toBe(200);
        expect(ctx.body).toEqual(completion);
        expect(ctx.responseHeaders['Content-Type']).toBe('application/json');
        expect(thread(ctx)).toMatchObject({ tokens_in: 2916, tokens_out: 10, model_id: 5, completion: 'OK' });
        expect(thread(ctx).fee).toBeCloseTo(0.0010923, 12);
    });
    it('sends the configured model id and nothing BRConnector-specific', async () => {
        const handler = stubHandler([{ status: 200, body: JSON.stringify(completion) }]);
        await new BedrockRuntimeOpenAI(handler).chat(request(), '', fakeCtx(model()));
        const sent = handler.seen[0];
        expect(sent.json.model).toBe('global.moonshotai.kimi-k3');
        for (const field of ['price_in', 'price_out', 'currency', 'model_id']) {
            expect(sent.json).not.toHaveProperty(field);
        }
        expect(signedKey(sent.authorization)).toBe('test-ak-1');
        expect(sent.request.hostname).toBe('bedrock-runtime.us-east-1.amazonaws.com');
    });
    it('stream: relays events, hides the usage chunk the client did not ask for, and bills it', async () => {
        const handler = stubHandler([{ status: 200, chunks: [content('O'), content('K'), usageChunk, DONE] }]);
        const ctx = fakeCtx(model());
        await new BedrockRuntimeOpenAI(handler).chat(request({ stream: true }), '', ctx);
        expect(ctx.res.chunks.join('')).toBe(content('O') + content('K') + DONE);
        expect(ctx.responseHeaders['Content-Type']).toBe('text/event-stream');
        expect(ctx.res.writableEnded).toBe(true);
        expect(handler.seen[0].json.stream_options.include_usage).toBe(true);
        expect(thread(ctx).tokens_in).toBe(2916);
        expect(thread(ctx).completion).toBe('OK');
    });
    it('stream: forwards the usage chunk when the client asked for it', async () => {
        const handler = stubHandler([{ status: 200, chunks: [content('O'), content('K'), usageChunk, DONE] }]);
        const ctx = fakeCtx(model());
        await new BedrockRuntimeOpenAI(handler).chat(request({ stream: true, stream_options: { include_usage: true } }), '', ctx);
        expect(ctx.res.chunks.join('')).toContain(usageChunk);
    });
    it('rejects a model id override with 400 before calling Bedrock', async () => {
        const handler = stubHandler([]);
        await expect(new BedrockRuntimeOpenAI(handler).chat(request({ model_id: 'us.anthropic.claude-sonnet-5-5' }), '', fakeCtx(model())))
            .rejects.toMatchObject({ statusCode: 400 });
        expect(handler.seen.length).toBe(0);
    });
    it('relays a Bedrock 400 without retrying', async () => {
        const message = "Invalid value: 1. This model accepts 'top_p' only with the value 0.95.";
        const handler = stubHandler([{ status: 400, body: JSON.stringify({ error: { message } }) }]);
        await expect(new BedrockRuntimeOpenAI(handler).chat(request(), '', fakeCtx(model())))
            .rejects.toMatchObject({ statusCode: 400, message });
        expect(handler.seen.length).toBe(1);
    });
    it('relays a non-JSON 502 body as a readable error', async () => {
        const handler = stubHandler([{ status: 502, body: '<html>Bad gateway</html>' }]);
        const ctx = fakeCtx(model({ config: { ...model().config, maxRetries: 0 } }));
        await expect(new BedrockRuntimeOpenAI(handler).chat(request(), '', ctx))
            .rejects.toMatchObject({ statusCode: 502, message: expect.stringContaining('Bad gateway') });
    });
    it('retries throttling with the other configured key', async () => {
        const credentials = [{ accessKeyId: 'test-ak-1', secretAccessKey: 'fake-secret' }, { accessKeyId: 'test-ak-2', secretAccessKey: 'fake-secret' }];
        const handler = stubHandler([{ status: 429 }, { status: 200, body: JSON.stringify(completion) }]);
        const ctx = fakeCtx(model({ config: { ...model().config, credentials } }));
        await new BedrockRuntimeOpenAI(handler).chat(request(), '', ctx);
        expect(handler.seen.length).toBe(2);
        expect(signedKey(handler.seen[1].authorization)).not.toBe(signedKey(handler.seen[0].authorization));
        expect(ctx.body).toEqual(completion);
    });
    it('stops after maxRetries', async () => {
        const handler = stubHandler([{ status: 503 }, { status: 503 }]);
        const ctx = fakeCtx(model({ config: { ...model().config, maxRetries: 1 } }));
        await expect(new BedrockRuntimeOpenAI(handler).chat(request(), '', ctx)).rejects.toMatchObject({ statusCode: 503 });
        expect(handler.seen.length).toBe(2);
    });
    it('rejects /v1/messages and /v1/completions with 400', async () => {
        const handler = stubHandler([]);
        const provider = new BedrockRuntimeOpenAI(handler);
        const ctx = fakeCtx(model());
        await expect(provider.chatAnthropic(request(), '', ctx)).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('/v1/messages') });
        await expect(provider.complete(request(), '', ctx)).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('/v1/completions') });
        expect(handler.seen.length).toBe(0);
    });
    it('stream: keeps reading Bedrock to the end when the client disconnects, and bills the full usage', async () => {
        const handler = scriptedHandler([reply(200, content('par'), content('tial'), usageChunk, DONE)]);
        const ctx = fakeCtx(model());
        const write = ctx.res.write;
        let writes = 0;
        // The client closes right after the first event. Nothing holds the stream back, so a close scheduled for later
        // would arrive only after the last event.
        ctx.res.write = (s: string) => {
            const ok = write(s);
            if (++writes === 1) ctx.res.emit('close');
            return ok;
        };
        await expect(new BedrockRuntimeOpenAI(handler).chat(request({ stream: true }), '', ctx)).resolves.toBeUndefined();
        expect(ctx.res.chunks).toEqual([content('par')]);
        expect(thread(ctx).tokens_in).toBe(2916);
        expect(thread(ctx).completion).toBe('partial');
        expect(ctx.logger.error).not.toHaveBeenCalled();
    });
    it('non-stream: bills the full usage when the client disconnects before Bedrock answers', async () => {
        const ctx = fakeCtx(model());
        const handler = scriptedHandler([async (options) => { ctx.res.emit('close'); return reply(200, okBody)(options); }]);
        await expect(new BedrockRuntimeOpenAI(handler).chat(request(), '', ctx)).resolves.toBeUndefined();
        expect(thread(ctx)).toMatchObject({ tokens_in: 2916, tokens_out: 10, completion: 'OK' });
        expect(thread(ctx).fee).toBeCloseTo(0.0010923, 12);
    });
    it('concurrent requests keep their own model, key and price', async () => {
        const modelA = model();
        const modelB = model({ id: 6, name: 'glm-5.3', price_in: 1e-6, config: { modelId: 'us.zai.glm-5.3', regions: ['us-east-1'], credentials: [{ accessKeyId: 'test-ak-2', secretAccessKey: 'fake-secret' }] } });
        const handler = stubHandler([{ status: 200, body: JSON.stringify(completion), delayMs: 20 }, { status: 200, body: JSON.stringify(completion) }]);
        const provider = new BedrockRuntimeOpenAI(handler);
        const ctxA = fakeCtx(modelA);
        const ctxB = fakeCtx(modelB);
        const reqA = request();
        const reqB = request({ model: 'glm-5.3', price_in: 1e-6 });
        // Request B's init finishes before request A's chat starts, so the shared instance holds B's model for both.
        provider.setModelData(modelA);
        provider.setModelData(modelB);
        await Promise.all([provider.chat(reqA, '', ctxA), provider.chat(reqB, '', ctxB)]);
        const sentFor = (modelId: string) => handler.seen.find((s) => s.json.model === modelId);
        expect(signedKey(sentFor('global.moonshotai.kimi-k3').authorization)).toBe('test-ak-1');
        expect(signedKey(sentFor('us.zai.glm-5.3').authorization)).toBe('test-ak-2');
        expect(thread(ctxA)).toMatchObject({ model_id: 5, price_in: 3e-6 });
        expect(thread(ctxB)).toMatchObject({ model_id: 6, price_in: 1e-6 });
    });
    it('a stream without usage is billed as zero tokens and logged', async () => {
        const handler = stubHandler([{ status: 200, chunks: [content('x'), DONE] }]);
        const ctx = fakeCtx(model());
        await new BedrockRuntimeOpenAI(handler).chat(request({ stream: true }), '', ctx);
        expect(thread(ctx).tokens_in).toBe(0);
        expect(ctx.logger.warn.mock.calls.some((args: any[]) => args.some((arg) => JSON.stringify(arg).includes('usage')))).toBe(true);
    });
});

describe('bedrock-runtime-openai provider: retry rules, disconnects, latencies and billing failures', () => {
    beforeEach(() => { for (const [name, value] of Object.entries(HERMETIC_ENV)) vi.stubEnv(name, value); });
    afterEach(() => { vi.restoreAllMocks(); });

    it.each([['code', 'ECONNRESET'], ['code', 'ECONNREFUSED'], ['code', 'ETIMEDOUT'], ['code', 'EPIPE'], ['code', 'ENOTFOUND'], ['code', 'EAI_AGAIN'], ['name', 'TimeoutError']])(
        'retries a network error with %s %s raised before any response, using the other configured key', async (field, value) => {
            // Without this the second pick could differ from the first by chance alone.
            vi.spyOn(Math, 'random').mockReturnValue(0);
            const handler = scriptedHandler([rejectWith(Object.assign(new Error('network failure'), { [field]: value })), reply(200, okBody)]);
            const ctx = fakeCtx(withConfig({ credentials: twoKeys }));
            await new BedrockRuntimeOpenAI(handler).chat(request(), '', ctx);
            expect(handler.seen.map((s) => signedKey(s.authorization))).toEqual(['test-ak-1', 'test-ak-2']);
            expect(ctx.body).toEqual(completion);
        });
    it.each(['CredentialsProviderError', 'AbortError'])('does not retry a call that fails with %s', async (name) => {
        const error = Object.assign(new Error('not a network failure'), { name });
        const handler = scriptedHandler([rejectWith(error), reply(200, okBody)]);
        await expect(new BedrockRuntimeOpenAI(handler).chat(request(), '', fakeCtx(model()))).rejects.toBe(error);
        expect(handler.seen).toHaveLength(1);
    });
    it('does not retry a network error once the client has disconnected, and bills nothing', async () => {
        const ctx = fakeCtx(model());
        const handler = scriptedHandler([
            async () => { ctx.res.emit('close'); throw Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }); },
            reply(200, okBody),
        ]);
        await expect(new BedrockRuntimeOpenAI(handler).chat(request(), '', ctx)).rejects.toMatchObject({ code: 'ECONNRESET' });
        expect(handler.seen).toHaveLength(1);
        expect(thread(ctx)).toBeUndefined();
    });
    it('does not retry an error status once the client has disconnected, and bills nothing', async () => {
        const ctx = fakeCtx(model());
        const handler = scriptedHandler([async () => { ctx.res.emit('close'); return reply(503)(); }, reply(200, okBody)]);
        await expect(new BedrockRuntimeOpenAI(handler).chat(request(), '', ctx)).rejects.toMatchObject({ statusCode: 503 });
        expect(handler.seen).toHaveLength(1);
        expect(thread(ctx)).toBeUndefined();
    });
    it('reads a discarded error response to the end before retrying', async () => {
        let drained = false;
        let drainedBeforeRetry: boolean | undefined;
        const handler = scriptedHandler([
            async () => ({ response: { statusCode: 503, headers: {}, body: (async function* () { yield Buffer.from('busy'); drained = true; })() } }),
            async () => { drainedBeforeRetry = drained; return reply(200, okBody)(); },
        ]);
        await new BedrockRuntimeOpenAI(handler).chat(request(), '', fakeCtx(model()));
        expect(drainedBeforeRetry).toBe(true);
    });
    it('retries an error status even when its body breaks off', async () => {
        const handler = scriptedHandler([
            async () => ({ response: { statusCode: 503, headers: {}, body: (async function* () {
                yield Buffer.from('bu');
                throw Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
            })() } }),
            reply(200, okBody),
        ]);
        const ctx = fakeCtx(model());
        await new BedrockRuntimeOpenAI(handler).chat(request(), '', ctx);
        expect(handler.seen).toHaveLength(2);
        expect(ctx.body).toEqual(completion);
    });
    it('logs each retry with what failed, the attempt, the key label and the model id', async () => {
        const handler = scriptedHandler([rejectWith(Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' })), reply(503), reply(200, okBody)]);
        const ctx = fakeCtx(model());
        await new BedrockRuntimeOpenAI(handler).chat(request(), '', ctx);
        expect(ctx.logger.warn.mock.calls).toEqual([
            [{ message: 'bedrock-runtime-openai retry', error: 'ECONNRESET', attempt: 0, auth: 'test-ak-...', modelId: 'global.moonshotai.kimi-k3' }],
            [{ message: 'bedrock-runtime-openai retry', status: 503, attempt: 1, auth: 'test-ak-...', modelId: 'global.moonshotai.kimi-k3' }],
        ]);
    });
    it.each([429, 500, 502, 503, 504])('retries HTTP %s', async (status) => {
        const handler = scriptedHandler([reply(status), reply(200, okBody)]);
        const ctx = fakeCtx(model());
        await new BedrockRuntimeOpenAI(handler).chat(request(), '', ctx);
        expect(handler.seen).toHaveLength(2);
        expect(ctx.body).toEqual(completion);
    });
    it.each([401, 403])('relays HTTP %s with that status and without retrying', async (status) => {
        const handler = scriptedHandler([reply(status, JSON.stringify({ message: 'The security token included in the request is invalid.' })), reply(200, okBody)]);
        await expect(new BedrockRuntimeOpenAI(handler).chat(request(), '', fakeCtx(model()))).rejects.toMatchObject({ statusCode: status });
        expect(handler.seen).toHaveLength(1);
    });
    it.each([undefined, 'abc'])('retries 3 times when maxRetries is %s', async (maxRetries) => {
        const handler = scriptedHandler([reply(503), reply(503), reply(503), reply(503), reply(200, okBody)]);
        await expect(new BedrockRuntimeOpenAI(handler).chat(request(), '', fakeCtx(withConfig({ maxRetries }))))
            .rejects.toMatchObject({ statusCode: 503 });
        expect(handler.seen).toHaveLength(4);
    });
    it('switches to the other configured key even when the random pick would repeat the failed one', async () => {
        vi.spyOn(Math, 'random').mockReturnValue(0);
        const handler = scriptedHandler([reply(429), reply(200, okBody)]);
        await new BedrockRuntimeOpenAI(handler).chat(request(), '', fakeCtx(withConfig({ credentials: twoKeys })));
        expect(handler.seen.map((s) => signedKey(s.authorization))).toEqual(['test-ak-1', 'test-ak-2']);
    });
    it('picks the region afresh for each attempt', async () => {
        vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0.99);
        const handler = scriptedHandler([reply(503), reply(200, okBody)]);
        await new BedrockRuntimeOpenAI(handler).chat(request(), '', fakeCtx(withConfig({ regions: ['us-east-1', 'us-west-2'] })));
        expect(handler.seen.map((s) => s.request.hostname)).toEqual(['bedrock-runtime.us-east-1.amazonaws.com', 'bedrock-runtime.us-west-2.amazonaws.com']);
    });
    it('records whole-millisecond latencies, with the first byte timed when the response arrives', async () => {
        const handler = stubHandler([{ status: 200, body: okBody, delayMs: 20 }]);
        const ctx = fakeCtx(model());
        await new BedrockRuntimeOpenAI(handler).chat(request(), '', ctx);
        const { first_byte_latency, invocation_latency } = thread(ctx);
        expect(Number.isInteger(first_byte_latency)).toBe(true);
        expect(Number.isInteger(invocation_latency)).toBe(true);
        expect(first_byte_latency).toBeGreaterThanOrEqual(15);
        expect(invocation_latency).toBeGreaterThanOrEqual(first_byte_latency);
    });
    it('logs a billing failure and still delivers the completion', async () => {
        const ctx = fakeCtx(model());
        ctx.db.insert = async () => { throw new Error('database is down'); };
        await new BedrockRuntimeOpenAI(stubHandler([{ status: 200, body: okBody }])).chat(request(), '', ctx);
        expect(ctx.body).toEqual(completion);
        expect(JSON.stringify(ctx.logger.error.mock.calls)).toContain('database is down');
    });
    it('stops retrying once the client has left, even when an earlier close listener has already ended the response', async () => {
        // The error middleware in src/middleware/handlers.ts registers its close listener before any provider runs and
        // ends the response there. On a dropped connection the end never finishes, and close is not emitted again.
        const ctx = fakeCtx(model());
        ctx.res.writableFinished = false;
        ctx.res.end = () => { ctx.res.writableEnded = true; };
        ctx.res.on('close', () => { if (!ctx.res.writableEnded) ctx.res.end(); });
        const handler = scriptedHandler([async () => { ctx.res.emit('close'); return reply(503)(); }, reply(200, okBody)]);
        await expect(new BedrockRuntimeOpenAI(handler).chat(request(), '', ctx)).rejects.toMatchObject({ statusCode: 503 });
        expect(handler.seen).toHaveLength(1);
    });
    it('stream: sets status 200 and the event-stream headers before the first event', async () => {
        const handler = stubHandler([{ status: 200, chunks: [content('O'), DONE] }]);
        const ctx = fakeCtx(model());
        const write = ctx.res.write;
        let atFirstWrite: any;
        ctx.res.write = (s: string) => { atFirstWrite ??= { status: ctx.status, headers: { ...ctx.responseHeaders } }; return write(s); };
        await new BedrockRuntimeOpenAI(handler).chat(request({ stream: true }), '', ctx);
        expect(atFirstWrite).toEqual({ status: 200, headers: { 'Connection': 'keep-alive', 'Cache-Control': 'no-cache', 'Content-Type': 'text/event-stream' } });
    });
    it('logs a stream that breaks off at error level, records what arrived and ends the response', async () => {
        const handler = scriptedHandler([async () => ({ response: { statusCode: 200, headers: {}, body: (async function* () {
            yield Buffer.from(content('par'));
            throw Object.assign(new Error('connection reset by Bedrock'), { code: 'ECONNRESET' });
        })() } })]);
        const ctx = fakeCtx(model());
        await new BedrockRuntimeOpenAI(handler).chat(request({ stream: true }), '', ctx);
        expect(JSON.stringify(ctx.logger.error.mock.calls)).toContain('connection reset by Bedrock');
        expect(thread(ctx).completion).toBe('par');
        expect(ctx.res.writableEnded).toBe(true);
    });
    it('answers 502 with the first 200 characters when a 200 response is not JSON', async () => {
        const page = `<html>${'maintenance '.repeat(30)}</html>`;
        const handler = stubHandler([{ status: 200, body: page }]);
        await expect(new BedrockRuntimeOpenAI(handler).chat(request(), '', fakeCtx(model())))
            .rejects.toMatchObject({ statusCode: 502, message: `Bedrock returned a response that is not JSON: ${page.slice(0, 200)}` });
    });
    it('rejects a model without a configured modelId before calling Bedrock', async () => {
        const handler = stubHandler([]);
        await expect(new BedrockRuntimeOpenAI(handler).chat(request(), '', fakeCtx(withConfig({ modelId: undefined }))))
            .rejects.toThrow("You must specify the parameters 'modelId' in the backend model configuration.");
        expect(handler.seen).toHaveLength(0);
    });
    it('reads the model only from ctx.state, never from the shared instance', async () => {
        const handler = stubHandler([{ status: 200, body: okBody }]);
        const provider = new BedrockRuntimeOpenAI(handler);
        provider.setModelData(model());
        const ctx = fakeCtx(model());
        ctx.state = {};
        await expect(provider.chat(request(), '', ctx)).rejects.toThrow('Model data is missing for this request.');
        expect(handler.seen).toHaveLength(0);
    });
});
