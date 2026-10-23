import { describe, expect, it, vi } from 'vitest';
import OpenAICompatible from '../src/providers/openai_compatible';
import AzureOpenAI from '../src/providers/azure_openai';
import { ADD_KEY_FEE_SQL } from '../src/providers/key_fee';
import { fakeDb } from './helpers/fakes';

// Both providers relay an OpenAI SDK stream. The upstream client is a stub that records the request and yields the
// given chunks; the fake database records the charge and the thread.
const providers: [string, () => any, any][] = [
    ['openai-compatible', () => new OpenAICompatible(), { baseURL: 'https://upstream.invalid/v1', apiKey: 'fake', model: 'up-model' }],
    ['azure-openai', () => new AzureOpenAI(), { baseURL: 'https://res.invalid/openai/deployments/d', apiKey: 'fake', apiVersion: '2025-01-01-preview' }],
];

const chunk = (delta: any, finish_reason: string | null = null) =>
    ({ id: 'c-1', object: 'chat.completion.chunk', created: 1, model: 'up-model', choices: [{ index: 0, delta, finish_reason }] });
const usageChunk = { id: 'c-1', object: 'chat.completion.chunk', created: 1, model: 'up-model', choices: [] as any[], usage: { prompt_tokens: 12, completion_tokens: 5, total_tokens: 17 } };
const toolCallsEnding = [chunk({ role: 'assistant', content: 'Hel' }), chunk({ content: 'lo' }, 'tool_calls'), usageChunk];
// 12 x 1e-6 + 5 x 2e-6
const FEE = 12 * 1e-6 + 5 * 2e-6;

const request = (extra: any = {}) => ({ model: 'third-party', stream: true, currency: 'USD', messages: [{ role: 'user', content: 'hi' }], ...extra });

function fakeCtx() {
    const ctx: any = {
        db: fakeDb(), user: { id: 5 }, headers: {}, chunks: [] as string[], ended: false, status: 404,
        set() {},
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    };
    ctx.res = { write(s: string) { ctx.chunks.push(String(s)); return true; }, end() { ctx.ended = true; } };
    return ctx;
}

function setup(make: () => any, config: any, chunks: any[]) {
    const provider = make();
    const create = vi.fn(async (_body: any) => (async function* () {
        for (const c of chunks) yield structuredClone(c);
    })());
    provider.client = { baseURL: config.baseURL, chat: { completions: { create } } };
    provider.setModelData({ id: 3, name: 'third-party', multiple: 1, model_type: 1, price_in: 1e-6, price_out: 2e-6, config });
    provider.setKeyData({ id: 5 });
    const ctx = fakeCtx();
    return { provider, create, ctx };
}

const charges = (ctx: any) => ctx.db.calls.filter((c: any[]) => c[0] === 'query' && c[1] === ADD_KEY_FEE_SQL).map((c: any[]) => c[2][0]);
const thread = (ctx: any) => ctx.db.calls.find((c: any[]) => c[0] === 'insert' && c[1] === 'eiai_thread')?.[2];
// The data of each event written to the client, parsed, except [DONE].
const written = (ctx: any) => ctx.chunks
    .map((s: string) => s.replace(/^data: /, '').trim())
    .filter((s: string) => s !== '[DONE]')
    .map((s: string) => JSON.parse(s));

describe.each(providers)('%s stream usage', (_name, make, config) => {
    it('bills tokens once after a tool_calls ending', async () => {
        const { provider, ctx } = setup(make, config, toolCallsEnding);
        await provider.chat(request(), 's-1', ctx);
        expect(charges(ctx)).toHaveLength(1);
        expect(charges(ctx)[0]).toBeCloseTo(FEE, 12);
        expect(thread(ctx)).toMatchObject({ tokens_in: 12, tokens_out: 5, completion: 'Hello' });
        expect(ctx.chunks[ctx.chunks.length - 1]).toBe('data: [DONE]\n\n');
        expect(ctx.ended).toBe(true);
    });

    it('asks the upstream for usage unless streamUsage is false', async () => {
        const on = setup(make, config, toolCallsEnding);
        await on.provider.chat(request(), 's-1', on.ctx);
        expect(on.create.mock.calls[0][0].stream_options).toEqual({ include_usage: true });

        const off = setup(make, { ...config, streamUsage: false }, toolCallsEnding);
        await off.provider.chat(request(), 's-1', off.ctx);
        expect(off.create.mock.calls[0][0]).not.toHaveProperty('stream_options');
    });

    it('drops the usage chunk when the client did not ask for it', async () => {
        const { provider, ctx } = setup(make, config, toolCallsEnding);
        await provider.chat(request(), 's-1', ctx);
        const parts = written(ctx);
        expect(parts.map((p: any) => p.choices[0]?.delta?.content)).toEqual(['Hel', 'lo']);
        expect(parts.some((p: any) => Array.isArray(p.choices) && p.choices.length === 0)).toBe(false);
        expect(charges(ctx)).toHaveLength(1);
        expect(charges(ctx)[0]).toBeCloseTo(FEE, 12);
    });

    it('forwards the usage chunk once when the client asked', async () => {
        const { provider, ctx } = setup(make, config, toolCallsEnding);
        await provider.chat(request({ stream_options: { include_usage: true } }), 's-1', ctx);
        const usageOnly = written(ctx).filter((p: any) => Array.isArray(p.choices) && p.choices.length === 0);
        expect(usageOnly).toEqual([usageChunk]);
        expect(charges(ctx)).toHaveLength(1);
        expect(charges(ctx)[0]).toBeCloseTo(FEE, 12);
    });

    // Some upstreams send the final usage chunk without a choices key at all.
    it('treats a usage chunk without choices as usage-only', async () => {
        const { choices: _omit, ...bare } = usageChunk;
        const chunks = [chunk({ role: 'assistant', content: 'Hel' }), chunk({ content: 'lo' }, 'stop'), bare];

        const dropped = setup(make, config, chunks);
        await dropped.provider.chat(request(), 's-1', dropped.ctx);
        expect(written(dropped.ctx).map((p: any) => p.choices?.[0]?.delta?.content)).toEqual(['Hel', 'lo']);
        expect(charges(dropped.ctx)).toHaveLength(1);
        expect(charges(dropped.ctx)[0]).toBeCloseTo(FEE, 12);

        const asked = setup(make, config, chunks);
        await asked.provider.chat(request({ stream_options: { include_usage: true } }), 's-1', asked.ctx);
        expect(written(asked.ctx).filter((p: any) => !('choices' in p))).toEqual([bare]);
    });

    it('saves 0 tokens and warns when the upstream reports no usage', async () => {
        const { provider, ctx } = setup(make, config, [chunk({ role: 'assistant', content: 'Hel' }), chunk({ content: 'lo' }, 'stop')]);
        await provider.chat(request(), 's-1', ctx);
        expect(charges(ctx)).toEqual([0]);
        expect(thread(ctx)).toMatchObject({ tokens_in: 0, tokens_out: 0, fee: 0, completion: 'Hello' });
        expect(ctx.logger.warn).toHaveBeenCalledTimes(1);
        expect(ctx.logger.warn.mock.calls[0][0]).toMatchObject({ model: 'third-party' });
        expect(ctx.logger.error).not.toHaveBeenCalled();
    });
});
