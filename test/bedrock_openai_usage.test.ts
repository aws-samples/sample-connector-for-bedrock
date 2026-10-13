import { describe, it, expect } from 'vitest';
import { computeUsageCost, pricesOf } from '../src/providers/bedrock_openai/usage';

const K3_PRICES = { price_in: 3e-6, price_out: 15e-6, price_cache_read: 0.3e-6, price_cache_write: 3.75e-6 };
// Measured 2026-10-12 on global.moonshotai.kimi-k3 (design doc, "Measured facts").
const writeUsage = { prompt_tokens: 2916, completion_tokens: 10, prompt_tokens_details: { cached_tokens: 0, cache_write_tokens: 2891 } };
const readUsage = { prompt_tokens: 2916, completion_tokens: 10, prompt_tokens_details: { cached_tokens: 2891, cache_write_tokens: 0 } };

describe('computeUsageCost', () => {
    it('bills uncached, cache-read and cache-write tokens at their own prices', () => {
        expect(computeUsageCost(writeUsage, K3_PRICES)).toEqual({ tokens_in: 2916, tokens_out: 10, cached_tokens: 0, cache_write_tokens: 2891, fee: expect.closeTo(0.01106625, 12) });
        expect(computeUsageCost(readUsage, K3_PRICES).fee).toBeCloseTo(0.0010923, 12);
    });
    it('bills cache tokens at price_in when no cache prices are configured', () => {
        expect(computeUsageCost(readUsage, { price_in: 3e-6, price_out: 15e-6 }).fee).toBeCloseTo(0.008898, 12);
    });
    it('accepts prices stored as decimal strings', () => {
        expect(computeUsageCost(readUsage, { price_in: '0.0000030000', price_out: '0.0000150000', price_cache_read: '0.0000003000' }).fee).toBeCloseTo(0.0010923, 12);
    });
    it('treats missing usage as zero tokens', () => {
        expect(computeUsageCost(null, K3_PRICES)).toEqual({ tokens_in: 0, tokens_out: 0, cached_tokens: 0, cache_write_tokens: 0, fee: 0 });
    });
});

describe('pricesOf', () => {
    it('reads the price columns and the cache prices from the model config', () => {
        const model = { name: 'kimi-k3', provider: 'bedrock-runtime-openai', multiple: 1, model_type: 1, price_in: '0.000003', price_out: '0.000015', config: { price_cache_read: 3e-7, price_cache_write: 3.75e-6 } };
        expect(pricesOf(model)).toEqual({ price_in: '0.000003', price_out: '0.000015', price_cache_read: 3e-7, price_cache_write: 3.75e-6 });
    });
});
