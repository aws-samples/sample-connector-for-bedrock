import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import BedrockRuntimeAnthropic from '../src/providers/bedrock_runtime_anthropic';
import { PING_EVENT } from '../src/providers/bedrock_anthropic/sse';
import { BetaDenylist } from '../src/providers/bedrock_anthropic/request';
import { toAnthropicError } from '../src/util/anthropic_error';
import { fakeDb } from './helpers/fakes';
import { HERMETIC_ENV } from './helpers/hermetic_env';

const key = (n: number) => ({ accessKeyId: `test-ak-${n}`, secretAccessKey: 'fake-secret' });
const model = (over: any = {}) => ({ id: 5, name: 'claude-sonnet-5-5', provider: 'bedrock-runtime-anthropic', multiple: 1, model_type: 1, price_in: 2e-6, price_out: 10e-6,
    config: { modelId: 'global.anthropic.claude-sonnet-5-5', regions: ['us-east-1'], price_cache_read: 0.1e-6, price_cache_write: 2.5e-6, price_cache_write_1h: 4e-6, credentials: [key(1)] }, ...over });
const withConfig = (config: any) => model({ config: { ...model().config, ...config } });
const body = (extra: any = {}) => ({ model: 'claude-sonnet-5-5', max_tokens: 100, messages: [{ role: 'user', content: 'hi' }], metadata: { user_id: '{"a":1}' }, ...extra });
const signedKey = (authorization: string) => /Credential=([^/]+)\//.exec(authorization)?.[1];

const e = (type: string, data: any) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
const start = e('message_start', { message: { id: 'm', usage: { input_tokens: 2, cache_read_input_tokens: 90868, cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 }, output_tokens: 1 } } });
const text = (t: string) => e('content_block_delta', { index: 0, delta: { type: 'text_delta', text: t } });
const delta = e('message_delta', { delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 4 } });
const stop = e('message_stop', {});
const errorEvent = e('error', { error: { type: 'overloaded_error', message: 'Overloaded' } });
const usage = { input_tokens: 2, cache_read_input_tokens: 90868, cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 }, output_tokens: 4 };
const okJson = JSON.stringify({ id: 'm', type: 'message', role: 'assistant', content: [{ type: 'text', text: 'OK' }], usage });

type Reply = { status: number; body?: string; chunks?: string[]; headers?: Record<string, string> };
function stubHandler(replies: Reply[]) {
    const seen: any[] = [];
    return { seen, handle: async (request: any) => {
        seen.push({ request, json: JSON.parse(request.body), authorization: request.headers.authorization });
        const r = replies.shift()!;
        const parts = r.chunks ?? [r.body ?? ''];
        async function* gen() {
            for (const p of parts) yield Buffer.from(p);
        }
        return { response: { statusCode: r.status, headers: r.headers ?? {}, body: gen() } };
    } };
}
function fakeCtx(modelData: any) {
    const res: any = new EventEmitter();
    res.chunks = [] as string[];
    res.writableEnded = false;
    res.write = (s: string) => { if (res.writableEnded) throw new Error('write after end'); res.chunks.push(String(s)); return true; };
    res.end = () => { res.writableEnded = true; res.emit('close'); };
    const responseHeaders: Record<string, string> = {};
    return { state: { modelData }, user: { id: 7, month_fee: '0', month_quota: '10', balance: '0', total_fee: '0' }, db: fakeDb(), headers: {} as Record<string, string>, res, status: 404, body: undefined as any, responseHeaders,
        set(k: any, v?: any) { if (typeof k === 'string') responseHeaders[k] = v; else Object.assign(responseHeaders, k); },
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } } as any;
}
const thread = (ctx: any) => ctx.db.calls.find((c: any[]) => c[0] === 'insert')?.[2];
const noWait = async () => {};
const sleepMs = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
const betaRejection = (value: string) => `{"type":"error","error":{"type":"invalid_request_error","message":"Unexpected value(s) \`${value}\` for the \`anthropic-beta\` header. Please consult our documentation at platform.claude.com/docs or try again without the header."}}`;

describe('bedrock-runtime-anthropic provider', () => {
    beforeEach(() => { for (const [name, value] of Object.entries(HERMETIC_ENV)) vi.stubEnv(name, value); });

    it('streams Bedrock events verbatim to the client and bills them', async () => {
        const h = stubHandler([{ status: 200, chunks: [start, text('OK'), delta, stop] }]); const ctx = fakeCtx(model());
        await new BedrockRuntimeAnthropic(h, noWait).messages(body({ stream: true }), 'sess-1', ctx);
        expect(h.seen[0].request.path).toBe('/anthropic/v1/messages');
        expect(h.seen[0].json.model).toBe('global.anthropic.claude-sonnet-5-5'); expect(h.seen[0].json.metadata).toBeUndefined();
        expect(ctx.res.chunks.join('')).toBe(start + text('OK') + delta + stop);
        expect(ctx.status).toBe(200);
        expect(ctx.responseHeaders).toMatchObject({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
        expect(ctx.res.writableEnded).toBe(true);
        expect(thread(ctx)).toMatchObject({ tokens_in: 90870, tokens_out: 4, completion: 'OK', whole_prompt: JSON.stringify(body().messages) });
        // input 2 x 2e-6, cache read 90868 x 0.1e-6, output 4 x 10e-6, no cache writes.
        expect(thread(ctx).fee).toBeCloseTo(2 * 2e-6 + 90868 * 0.1e-6 + 4 * 10e-6, 12);
        expect(ctx.logger.error).not.toHaveBeenCalled();
    });
    it('non-stream: returns the JSON and bills the usage and text', async () => {
        const h = stubHandler([{ status: 200, body: okJson }]); const ctx = fakeCtx(model());
        await new BedrockRuntimeAnthropic(h, noWait).messages(body(), '', ctx);
        expect(ctx.status).toBe(200);
        expect(ctx.responseHeaders['Content-Type']).toBe('application/json');
        expect(ctx.body).toEqual(JSON.parse(okJson));
        expect(thread(ctx)).toMatchObject({ tokens_in: 90870, tokens_out: 4, completion: 'OK' });
    });
    it('non-stream: joins text blocks, and a body that is not JSON is a 502', async () => {
        const two = JSON.stringify({ content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }], usage });
        const ctx = fakeCtx(model());
        await new BedrockRuntimeAnthropic(stubHandler([{ status: 200, body: two }]), noWait).messages(body(), '', ctx);
        expect(thread(ctx).completion).toBe('ab');
        await expect(new BedrockRuntimeAnthropic(stubHandler([{ status: 200, body: '<html>' }]), noWait).messages(body(), '', fakeCtx(model())))
            .rejects.toMatchObject({ statusCode: 502 });
    });
    it('non-stream: returns the JSON and stores tool_use when there is no text', async () => {
        const json = { id: 'm', type: 'message', content: [{ type: 'tool_use', name: 'Bash', id: 't', input: { command: 'ls' } }], usage };
        const h = stubHandler([{ status: 200, body: JSON.stringify(json) }]); const ctx = fakeCtx(model());
        await new BedrockRuntimeAnthropic(h, noWait).messages(body(), '', ctx);
        expect(ctx.body).toEqual(json);
        expect(thread(ctx).completion).toBe('[{"type":"tool_use","name":"Bash","input":{"command":"ls"}}]');
    });
    it('stream: stores tool_use when there is no text', async () => {
        const toolStart = e('content_block_start', { index: 0, content_block: { type: 'tool_use', id: 't', name: 'Bash', input: {} } });
        const toolDelta = e('content_block_delta', { index: 0, delta: { type: 'input_json_delta', partial_json: '{"command":"ls"}' } });
        const toolStop = e('content_block_stop', { index: 0 });
        const h = stubHandler([{ status: 200, chunks: [start, toolStart, toolDelta, toolStop, delta, stop] }]); const ctx = fakeCtx(model());
        await new BedrockRuntimeAnthropic(h, noWait).messages(body({ stream: true }), '', ctx);
        expect(thread(ctx).completion).toBe('[{"type":"tool_use","name":"Bash","input":{"command":"ls"}}]');
    });
    it('sends the client anthropic-version and a beta list, and omits an empty beta header', async () => {
        const h = stubHandler([{ status: 200, body: okJson }, { status: 200, body: okJson }]);
        const ctx = fakeCtx(model()); ctx.headers['anthropic-version'] = '2024-10-22'; ctx.headers['anthropic-beta'] = 'a-1, b-2';
        await new BedrockRuntimeAnthropic(h, noWait).messages(body(), '', ctx);
        await new BedrockRuntimeAnthropic(h, noWait).messages(body(), '', fakeCtx(model()));
        expect(h.seen[0].request.headers['anthropic-beta']).toBe('a-1,b-2');
        expect(h.seen[0].request.headers['anthropic-version']).toBe('2024-10-22');
        expect(h.seen[1].request.headers['anthropic-version']).toBe('2023-06-01');
        expect(h.seen[1].request.headers['anthropic-beta']).toBeUndefined();
    });
    it('drops a beta Bedrock rejects, retries once and remembers it for the model', async () => {
        const rejected = betaRejection('prompt-caching-scope-2026-01-05');
        const h = stubHandler([{ status: 400, body: rejected }, { status: 200, body: okJson }, { status: 200, body: okJson }]);
        const ctx = fakeCtx(model()); ctx.headers['anthropic-beta'] = 'claude-code-20250219,prompt-caching-scope-2026-01-05';
        const deny = new BetaDenylist();
        await new BedrockRuntimeAnthropic(h, noWait, { denylist: deny }).messages(body(), 's', ctx);
        expect(h.seen.map((s: any) => s.request.headers['anthropic-beta'])).toEqual(['claude-code-20250219,prompt-caching-scope-2026-01-05', 'claude-code-20250219']);
        const ctx2 = fakeCtx(model()); ctx2.headers['anthropic-beta'] = 'claude-code-20250219,prompt-caching-scope-2026-01-05';
        await new BedrockRuntimeAnthropic(h, noWait, { denylist: deny }).messages(body(), 's', ctx2);
        expect(h.seen[2].request.headers['anthropic-beta']).toBe('claude-code-20250219');
        const learned = ctx.logger.info.mock.calls.filter((c: any[]) => c[0]?.message === 'bedrock-runtime-anthropic dropped betas Bedrock rejected');
        expect(learned).toHaveLength(1);
        expect(learned[0][0]).toMatchObject({ betas: ['prompt-caching-scope-2026-01-05'], modelId: expect.any(String) });
    });
    it('learns nothing when the resend with the beta stripped is also refused (poisoning)', async () => {
        const second = '{"type":"error","error":{"type":"invalid_request_error","message":"junk header value"}}';
        const h = stubHandler([{ status: 400, body: betaRejection('context-1m-2025-08-07') }, { status: 400, body: second }]);
        const ctx = fakeCtx(model()); ctx.headers['anthropic-beta'] = 'context-1m-2025-08-07, x`context-1m-2025-08-07';
        const deny = new BetaDenylist();
        await expect(new BedrockRuntimeAnthropic(h, noWait, { denylist: deny }).messages(body(), 's', ctx)).rejects.toMatchObject({ statusCode: 400, body: second });
        expect(deny.strip('global.anthropic.claude-sonnet-5-5', ['context-1m-2025-08-07'])).toEqual(['context-1m-2025-08-07']);
        expect(ctx.logger.info).not.toHaveBeenCalled();
    });
    it('learns nothing when the resend hits a 503, and still retries as usual', async () => {
        const h = stubHandler([{ status: 400, body: betaRejection('b-1') }, { status: 503 }, { status: 200, body: okJson }]);
        const ctx = fakeCtx(model()); ctx.headers['anthropic-beta'] = 'b-1,b-2';
        const deny = new BetaDenylist();
        await new BedrockRuntimeAnthropic(h, noWait, { denylist: deny }).messages(body(), 's', ctx);
        expect(deny.strip('global.anthropic.claude-sonnet-5-5', ['b-1'])).toEqual(['b-1']);
        expect(ctx.logger.info).not.toHaveBeenCalled();
        expect(h.seen.length).toBe(3);
    });
    it('omits the beta header when every beta was rejected', async () => {
        const h = stubHandler([{ status: 400, body: betaRejection('only-beta') }, { status: 200, body: okJson }]);
        const ctx = fakeCtx(model()); ctx.headers['anthropic-beta'] = 'only-beta';
        await new BedrockRuntimeAnthropic(h, noWait, { denylist: new BetaDenylist() }).messages(body(), 's', ctx);
        expect(h.seen[1].request.headers['anthropic-beta']).toBeUndefined();
    });
    it('does not strip a beta that was not sent', async () => {
        const h = stubHandler([{ status: 400, body: betaRejection('not-sent') }]);
        const ctx = fakeCtx(model()); ctx.headers['anthropic-beta'] = 'other';
        await expect(new BedrockRuntimeAnthropic(h, noWait, { denylist: new BetaDenylist() }).messages(body(), 's', ctx)).rejects.toMatchObject({ statusCode: 400 });
        expect(h.seen.length).toBe(1);
    });
    it('returns the second 400 as it is when stripping does not help', async () => {
        const second = '{"type":"error","error":{"type":"invalid_request_error","message":"max_tokens: too large"}}';
        const h = stubHandler([{ status: 400, body: betaRejection('x-beta') }, { status: 400, body: second }]);
        const ctx = fakeCtx(model()); ctx.headers['anthropic-beta'] = 'x-beta';
        await expect(new BedrockRuntimeAnthropic(h, noWait, { denylist: new BetaDenylist() }).messages(body(), 's', ctx))
            .rejects.toMatchObject({ statusCode: 400, body: second });
        expect(h.seen.length).toBe(2);
    });
    it('strips at most once per call, even after a retry', async () => {
        const h = stubHandler([{ status: 400, body: betaRejection('b-1') }, { status: 503 }, { status: 400, body: betaRejection('b-2') }]);
        const ctx = fakeCtx(model()); ctx.headers['anthropic-beta'] = 'b-1,b-2';
        await expect(new BedrockRuntimeAnthropic(h, noWait, { denylist: new BetaDenylist() }).messages(body(), 's', ctx)).rejects.toMatchObject({ statusCode: 400 });
        expect(h.seen.map((s: any) => s.request.headers['anthropic-beta'])).toEqual(['b-1,b-2', 'b-2', 'b-2']);
    });
    it('keeps one session on one credential, and moves on only on a retry', async () => {
        const config = { credentials: [key(1), key(2)], regions: ['us-east-1', 'us-west-2'] };
        const h = stubHandler([{ status: 200, body: okJson }, { status: 200, body: okJson }, { status: 503 }, { status: 200, body: okJson }]);
        const provider = () => new BedrockRuntimeAnthropic(h, noWait);
        await provider().messages(body(), 'same-session', fakeCtx(withConfig(config)));
        await provider().messages(body(), 'same-session', fakeCtx(withConfig(config)));
        expect(signedKey(h.seen[1].authorization)).toBe(signedKey(h.seen[0].authorization));
        expect(h.seen[1].request.hostname).toBe(h.seen[0].request.hostname);
        const ctx = fakeCtx(withConfig(config));
        await provider().messages(body(), 'same-session', ctx);
        expect(signedKey(h.seen[2].authorization)).toBe(signedKey(h.seen[0].authorization));
        expect(signedKey(h.seen[3].authorization)).not.toBe(signedKey(h.seen[2].authorization));
        expect(h.seen[3].request.hostname).not.toBe(h.seen[2].request.hostname);
        expect(ctx.logger.warn).toHaveBeenCalledWith(expect.objectContaining({ message: 'bedrock-runtime-anthropic retry', status: 503 }));
    });
    it('rejects a model id override, an overlong session id and a missing modelId before calling Bedrock', async () => {
        const h = stubHandler([]);
        const run = (b: any, session: string | undefined, m: any = model()) => new BedrockRuntimeAnthropic(h, noWait).messages(b, session, fakeCtx(m));
        const override = run(body({ model: 'claude-sonnet-5-5/us.anthropic.x' }), '');
        await expect(override).rejects.toMatchObject({ statusCode: 400, anthropicType: 'invalid_request_error',
            message: 'The [claude-sonnet-5-5] model does not accept a model id override ("claude-sonnet-5-5/<model id>"). Send the model name only.' });
        await expect(run(body(), 'x'.repeat(129))).rejects.toMatchObject({ statusCode: 400, anthropicType: 'invalid_request_error', message: 'Session-Id must be at most 128 characters.' });
        await expect(run(body(), undefined, withConfig({ modelId: undefined }))).rejects.toMatchObject({ statusCode: 400, anthropicType: 'invalid_request_error',
            message: "You must specify the parameters 'modelId' in the backend model configuration." });
        expect(h.seen.length).toBe(0);
    });
    it('accepts a configured model whose name contains "/"', async () => {
        const h = stubHandler([{ status: 200, body: okJson }]); const ctx = fakeCtx(model({ name: 'team/claude' }));
        await new BedrockRuntimeAnthropic(h, noWait).messages(body({ model: 'team/claude' }), '', ctx);
        expect(ctx.status).toBe(200);
        expect(h.seen[0].json.model).toBe('global.anthropic.claude-sonnet-5-5');
        expect(ctx.body).toEqual(JSON.parse(okJson));
        expect(thread(ctx)).toMatchObject({ tokens_in: 90870, tokens_out: 4, completion: 'OK' });
    });
    it('counts a session id in characters, not UTF-16 units', async () => {
        const h = stubHandler([{ status: 200, body: okJson }]);
        await expect(new BedrockRuntimeAnthropic(h, noWait).messages(body(), '\u{1F600}'.repeat(128), fakeCtx(model()))).resolves.toBeUndefined();
    });
    it('a missing model on the context is a plain error', async () => {
        const ctx = fakeCtx(undefined);
        await expect(new BedrockRuntimeAnthropic(stubHandler([]), noWait).messages(body(), '', ctx)).rejects.toThrow('Model data is missing');
    });
    it('chat, complete and chatAnthropic refuse', async () => {
        const h = stubHandler([]); const provider = new BedrockRuntimeAnthropic(h, noWait); const ctx = fakeCtx(model());
        await expect(provider.chat({ model: 'x' } as any, '', ctx)).rejects.toMatchObject({ statusCode: 400, anthropicType: 'invalid_request_error',
            message: 'The [claude-sonnet-5-5] model does not support /v1/chat/completions. Use /v1/messages.', name: 'BedrockRuntimeAnthropicError' });
        await expect(provider.complete({ model: 'x' } as any, '', ctx)).rejects.toMatchObject({ statusCode: 400,
            message: 'The [claude-sonnet-5-5] model does not support /v1/completions. Use /v1/messages.' });
        await expect(provider.chatAnthropic({ model: 'x' } as any, '', ctx)).rejects.toThrow('bedrock-runtime-anthropic requests are dispatched to messages()');
        expect(h.seen.length).toBe(0);
    });
    it('keeps reading after the client leaves and bills the whole stream; no ping reaches the client after that', async () => {
        const ctx = fakeCtx(model());
        let pausedUntil = 0;
        const handler = { handle: async () => ({ response: { statusCode: 200, headers: {}, body: (async function* () {
            yield Buffer.from(start);
            ctx.res.emit('close');
            // Silent for several ping intervals, so the relay's timer fires while the client is gone.
            await sleepMs(80);
            yield Buffer.from(text('par'));
            yield Buffer.from(text('tial'));
            yield Buffer.from(delta);
            yield Buffer.from(stop);
            pausedUntil = Date.now();
        })() } }) };
        await expect(new BedrockRuntimeAnthropic(handler, noWait, { pingIntervalMs: 10 }).messages(body({ stream: true }), 's', ctx)).resolves.toBeUndefined();
        expect(pausedUntil).toBeGreaterThan(0);
        expect(ctx.res.chunks).toEqual([start]);
        expect(thread(ctx)).toMatchObject({ tokens_in: 90870, tokens_out: 4, completion: 'partial' });
        expect(ctx.logger.error).not.toHaveBeenCalled();
        await sleepMs(50);
        expect(ctx.res.chunks).toEqual([start]);
    });
    it('non-stream: bills the full usage when the client leaves before Bedrock answers', async () => {
        const ctx = fakeCtx(model());
        const handler = { handle: async () => { ctx.res.emit('close'); return { response: { statusCode: 200, headers: {}, body: (async function* () { yield Buffer.from(okJson); })() } }; } };
        await expect(new BedrockRuntimeAnthropic(handler, noWait).messages(body(), 's', ctx)).resolves.toBeUndefined();
        expect(thread(ctx)).toMatchObject({ tokens_in: 90870, tokens_out: 4, completion: 'OK' });
    });
    it('does not resend a rejected beta once the client has left', async () => {
        const ctx = fakeCtx(model()); ctx.headers['anthropic-beta'] = 'b-1,b-2';
        const h = { seen: 0, handle: async () => { h.seen++; ctx.res.emit('close'); return { response: { statusCode: 400, headers: {}, body: (async function* () { yield Buffer.from(betaRejection('b-1')); })() } }; } };
        await expect(new BedrockRuntimeAnthropic(h, noWait, { denylist: new BetaDenylist() }).messages(body(), 's', ctx)).rejects.toMatchObject({ statusCode: 400 });
        expect(h.seen).toBe(1);
    });
    it('retries a network error and then succeeds', async () => {
        const h = stubHandler([{ status: 200, body: okJson }]); const ctx = fakeCtx(model());
        const handler = { handle: async (request: any, options?: any) => {
            if (h.seen.length === 0 && !(handler as any).failed) { (handler as any).failed = true; throw Object.assign(new Error('reset'), { code: 'ECONNRESET' }); }
            return h.handle(request);
        } };
        await new BedrockRuntimeAnthropic(handler, noWait).messages(body(), 's', ctx);
        expect(h.seen.length).toBe(1);
        expect(ctx.logger.warn).toHaveBeenCalledWith(expect.objectContaining({ message: 'bedrock-runtime-anthropic retry', error: 'ECONNRESET' }));
        expect(ctx.body).toEqual(JSON.parse(okJson));
    });
    it('answers 504 for a timeout when no retries are left', async () => {
        let calls = 0;
        const handler = { handle: async () => { calls++; throw Object.assign(new Error('timed out'), { name: 'TimeoutError' }); } };
        await expect(new BedrockRuntimeAnthropic(handler, noWait).messages(body(), 's', fakeCtx(withConfig({ maxRetries: 0 })))).rejects.toMatchObject({ statusCode: 504, name: 'BedrockRuntimeAnthropicError' });
        expect(calls).toBe(1);
    });
    it('writes a ping while the client waits through upstream silence', async () => {
        const ctx = fakeCtx(model());
        const handler = { handle: async () => ({ response: { statusCode: 200, headers: {}, body: (async function* () {
            yield Buffer.from(start);
            await sleepMs(120);
            yield Buffer.from(text('OK'));
            yield Buffer.from(delta);
            yield Buffer.from(stop);
        })() } }) };
        await new BedrockRuntimeAnthropic(handler, noWait, { pingIntervalMs: 10 }).messages(body({ stream: true }), 's', ctx);
        expect(ctx.res.chunks).toContain(PING_EVENT);
        expect(ctx.res.chunks.join('')).toContain(start + PING_EVENT);
    });
    it('does not retry once the client has left', async () => {
        const ctx = fakeCtx(model());
        const h = { seen: 0, handle: async () => { h.seen++; ctx.res.emit('close'); return { response: { statusCode: 503, headers: {}, body: (async function* () { yield Buffer.from('x'); })() } }; } };
        await expect(new BedrockRuntimeAnthropic(h, noWait).messages(body(), 's', ctx)).rejects.toMatchObject({ statusCode: 503 });
        expect(h.seen).toBe(1);
        expect(thread(ctx)).toBeUndefined();
    });
    it('passes an upstream Anthropic error through with retry-after', async () => {
        const upstream = '{"type":"error","error":{"type":"rate_limit_error","message":"Too many requests"}}';
        const h = stubHandler([{ status: 429, body: upstream, headers: { 'retry-after': '3' } }]);
        const ctx = fakeCtx(withConfig({ maxRetries: 0 }));
        const error = await new BedrockRuntimeAnthropic(h, noWait).messages(body(), 's', ctx).catch((ex) => ex);
        const out = toAnthropicError(error);
        expect(out.status).toBe(429);
        expect(out.body.error.type).toBe('rate_limit_error');
        expect(out.headers).toMatchObject({ 'retry-after': '3' });
    });
    it('records the stream as incomplete when Bedrock sends an error event mid-stream', async () => {
        const h = stubHandler([{ status: 200, chunks: [start, errorEvent] }]); const ctx = fakeCtx(model());
        await new BedrockRuntimeAnthropic(h, noWait).messages(body({ stream: true }), 's', ctx);
        expect(ctx.logger.error).toHaveBeenCalledWith(expect.objectContaining({ message: 'bedrock-runtime-anthropic stream ended before message_stop' }));
        expect(ctx.res.chunks.join('')).toBe(start + errorEvent);
        expect(thread(ctx)).toMatchObject({ tokens_in: 90870 });
    });
    it('answers 502 when the stream breaks before its first event', async () => {
        const ctx = fakeCtx(model());
        const handler = { handle: async () => ({ response: { statusCode: 200, headers: {}, body: (async function* () { throw new Error('socket hang up'); })() } }) };
        await expect(new BedrockRuntimeAnthropic(handler, noWait).messages(body({ stream: true }), 's', ctx)).rejects.toMatchObject({ statusCode: 502 });
    });
    it('logs a billing failure and still answers', async () => {
        const h = stubHandler([{ status: 200, body: okJson }]); const ctx = fakeCtx(model());
        ctx.db.insert = async () => { throw new Error('db down'); };
        await new BedrockRuntimeAnthropic(h, noWait).messages(body(), '', ctx);
        expect(ctx.body).toEqual(JSON.parse(okJson));
        expect(ctx.logger.error).toHaveBeenCalledWith(expect.objectContaining({ message: 'bedrock-runtime-anthropic could not record usage' }));
    });
});
