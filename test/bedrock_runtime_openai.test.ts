import { describe, it, expect, vi, beforeEach } from 'vitest';
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

type Reply = { status: number; body?: string; chunks?: string[]; hangAfterFirst?: boolean; delayMs?: number };
function stubHandler(replies: Reply[]) {
    const seen: any[] = [];
    return { seen, handle: async (request: any, options?: { abortSignal?: AbortSignal }) => {
        seen.push({ request, json: JSON.parse(request.body), authorization: request.headers.authorization });
        const r = replies.shift()!;
        if (r.delayMs) await new Promise((ok) => setTimeout(ok, r.delayMs));
        const parts = r.chunks ?? [r.body ?? ''];
        async function* body() {
            for (const [i, p] of parts.entries()) {
                yield Buffer.from(p);
                if (r.hangAfterFirst && i === 0) await new Promise((_, fail) => options?.abortSignal?.addEventListener('abort', () => fail(new Error('aborted'))));
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
    it('aborts the upstream stream when the client disconnects and bills what it got', async () => {
        const handler = stubHandler([{ status: 200, chunks: [content('par'), usageChunk, DONE], hangAfterFirst: true }]);
        const ctx = fakeCtx(model());
        const write = ctx.res.write;
        let writes = 0;
        ctx.res.write = (s: string) => {
            const ok = write(s);
            if (++writes === 1) setImmediate(() => ctx.res.emit('close'));
            return ok;
        };
        await expect(new BedrockRuntimeOpenAI(handler).chat(request({ stream: true }), '', ctx)).resolves.toBeUndefined();
        expect(ctx.res.chunks).toEqual([content('par')]);
        expect(thread(ctx).completion).toBe('par');
        expect(thread(ctx).tokens_in).toBe(0);
        expect(ctx.logger.error).not.toHaveBeenCalled();
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
