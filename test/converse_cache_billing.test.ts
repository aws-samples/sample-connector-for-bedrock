import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BedrockRuntimeClient, ConverseStreamCommand } from '@aws-sdk/client-bedrock-runtime';
import AbstractProvider from '../src/providers/abstract_provider';
import BedrockConverse from '../src/providers/bedrock_converse';
import { ADD_KEY_FEE_SQL } from '../src/providers/key_fee';
import { fakeDb } from './helpers/fakes';
import { HERMETIC_ENV } from './helpers/hermetic_env';

// Converse reports inputTokens without the cache-read and cache-write tokens, so each of the four counts is billed at
// its own price. Prices are per token; the cache prices are in the model config, as on bedrock-runtime-anthropic.
const prices = { price_in: 0.000003, price_out: 0.000015, config: { price_cache_read: 0.0000003, price_cache_write: 0.00000375 } };
const usage = { inputTokens: 100, outputTokens: 20, cacheReadInputTokens: 1000, cacheWriteInputTokens: 200 };

const model = (cachePrices: any = prices.config) => ({
    id: 7, name: 'converse-model', provider: 'bedrock-converse', multiple: 1, model_type: 1, price_in: prices.price_in, price_out: prices.price_out,
    config: { modelId: 'test.converse-v1:0', regions: ['us-east-1'], ...cachePrices },
});
const request = (stream: boolean) => ({ model: 'converse-model', stream, currency: 'USD', messages: [{ role: 'user', content: 'hi' }] });

function fakeCtx() {
    const chunks: string[] = [];
    return {
        db: fakeDb(), user: { id: 5 }, headers: {}, chunks, status: 404, body: undefined as any,
        res: { write: (s: string) => { chunks.push(String(s)); return true; }, end: () => {} },
        set() {},
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    } as any;
}
const charges = (ctx: any) => ctx.db.calls.filter((c: any[]) => c[0] === 'query' && c[1] === ADD_KEY_FEE_SQL).map((c: any[]) => c[2][0]);
const charged = (ctx: any) => {
    const all = charges(ctx);
    expect(all).toHaveLength(1);
    return all[0];
};
const thread = (ctx: any) => ctx.db.calls.find((c: any[]) => c[0] === 'insert' && c[1] === 'eiai_thread')?.[2];

function stubBedrock(u: any = usage) {
    return vi.spyOn(BedrockRuntimeClient.prototype, 'send').mockImplementation((async (command: any) => {
        if (command instanceof ConverseStreamCommand) {
            return {
                stream: (async function* () {
                    yield { messageStart: { role: 'assistant' } };
                    yield { contentBlockDelta: { contentBlockIndex: 0, delta: { text: 'ok' } } };
                    yield { contentBlockStop: { contentBlockIndex: 0 } };
                    yield { messageStop: { stopReason: 'end_turn' } };
                    yield { metadata: { usage: u, metrics: { latencyMs: 5 } } };
                })(),
            };
        }
        return {
            output: { message: { role: 'assistant', content: [{ text: 'ok' }] } }, stopReason: 'end_turn',
            usage: u, metrics: { latencyMs: 5 }, $metadata: { requestId: 'r-1' },
        };
    }) as any);
}

function provider(modelData: any = model()) {
    const p: any = new BedrockConverse();
    p.setModelData(modelData);
    p.setKeyData({ id: 5 });
    return p;
}

const paths: Record<string, (p: any, ctx: any) => Promise<void>> = {
    'chat stream': (p, ctx) => p.chat(request(true), 's-1', ctx),
    'chat sync': (p, ctx) => p.chat(request(false), 's-1', ctx),
    'messages stream': (p, ctx) => p.chatAnthropic(request(true), 's-1', ctx),
    'messages sync': (p, ctx) => p.chatAnthropic(request(false), 's-1', ctx),
    'completions stream': (p, ctx) => p.complete(request(true), 's-1', ctx),
    'completions sync': (p, ctx) => p.complete(request(false), 's-1', ctx),
};

describe('bedrock-converse bills prompt-cache tokens', () => {
    beforeEach(() => {
        for (const [name, value] of Object.entries(HERMETIC_ENV)) vi.stubEnv(name, value);
    });
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllEnvs();
    });

    it.each(Object.keys(paths))('%s bills cache tokens', async (path) => {
        stubBedrock();
        const ctx = fakeCtx();
        await paths[path](provider(), ctx);
        // 100 x 3e-6 + 1000 x 0.3e-6 + 200 x 3.75e-6 + 20 x 15e-6
        expect(charged(ctx)).toBeCloseTo(0.00165, 10);
        expect(thread(ctx).tokens_in).toBe(1300);
        expect(thread(ctx).tokens_out).toBe(20);
        expect(thread(ctx).fee).toBeCloseTo(0.00165, 10);
        expect(ctx.logger.error).not.toHaveBeenCalled();
    });

    it.each([
        ['no cache price is set', {}],
        ['the cache prices are blank strings', { price_cache_read: '', price_cache_write: ' ' }],
    ])('cache tokens fall back to price_in when %s', async (_name, cachePrices) => {
        stubBedrock();
        const ctx = fakeCtx();
        await paths['chat sync'](provider(model(cachePrices)), ctx);
        // 100 x 3e-6 + 1200 x 3e-6 + 20 x 15e-6
        expect(charged(ctx)).toBeCloseTo(0.0042, 10);
        expect(thread(ctx).tokens_in).toBe(1300);
    });

    it('a usage without cache counts bills input and output only', async () => {
        stubBedrock({ inputTokens: 100, outputTokens: 20 });
        const ctx = fakeCtx();
        await paths['chat stream'](provider(), ctx);
        expect(charged(ctx)).toBeCloseTo(0.0006, 10);
        expect(thread(ctx).tokens_in).toBe(100);
    });

    it('keeps the usage the client sees as Converse reports it', async () => {
        stubBedrock();
        const ctx = fakeCtx();
        await paths['chat sync'](provider(), ctx);
        expect(ctx.body.usage).toMatchObject({ prompt_tokens: 100, completion_tokens: 20 });
        const msgCtx = fakeCtx();
        await paths['messages sync'](provider(), msgCtx);
        expect(msgCtx.body.usage).toEqual({ input_tokens: 100, output_tokens: 20 });
    });
});

describe('saveThread', () => {
    class TestProvider extends AbstractProvider {
        async chat() {}
    }

    it('counts a missing token count as 0, so the fee is still a number', async () => {
        const p = new TestProvider();
        p.setModelData(model());
        p.setKeyData({ id: 5 });
        const ctx = fakeCtx();
        await p.saveThread(ctx, '', request(true) as any, { text: 'ok', input_tokens: undefined, output_tokens: 20 } as any);
        expect(charged(ctx)).toBeCloseTo(0.0003, 10);
        expect(thread(ctx)).toMatchObject({ tokens_in: 0, tokens_out: 20 });
        expect(ctx.logger.error).not.toHaveBeenCalled();
    });
});
