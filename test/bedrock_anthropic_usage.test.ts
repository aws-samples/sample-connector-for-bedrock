import { describe, it, expect } from 'vitest';
import { computeAnthropicCost, mergeAnthropicUsage } from '../src/providers/bedrock_anthropic/usage';

const sonnet = { price_in: 2e-6, price_out: 10e-6, price_cache_read: 0.1e-6, price_cache_write: 2.5e-6, price_cache_write_1h: 4e-6 };
describe('computeAnthropicCost', () => {
    it('bills the five token kinds at their own prices', () => {
        const c = computeAnthropicCost({ input_tokens: 2, cache_read_input_tokens: 90868, cache_creation_input_tokens: 1000, cache_creation: { ephemeral_5m_input_tokens: 600, ephemeral_1h_input_tokens: 400 }, output_tokens: 50 }, sonnet);
        expect(c).toMatchObject({ tokens_in: 91870, tokens_out: 50, cached_tokens: 90868, cache_write_tokens: 1000 });
        expect(c.fee).toBeCloseTo(0.0126908, 10);
    });
    it('counts cache writes as 5m without a breakdown', () => {
        expect(computeAnthropicCost({ input_tokens: 10, cache_creation_input_tokens: 100, output_tokens: 5 }, sonnet).fee).toBeCloseTo(0.00032, 12);
    });
    it('bills 1h writes at the 5m price when no 1h price is configured', () => {
        const { price_cache_write_1h, ...no1h } = sonnet;
        expect(computeAnthropicCost({ cache_creation_input_tokens: 400, cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 400 } }, no1h).fee).toBeCloseTo(400 * 2.5e-6, 12);
    });
    it('bills cache tokens at the input price when no cache price is configured, and null usage as zero', () => {
        const plain = { price_in: 2e-6, price_out: 10e-6 };
        // input 2 + cache read 10 + cache write 5 (5m, falls back to price_in) at 2e-6, output 1 at 10e-6
        expect(computeAnthropicCost({ input_tokens: 2, cache_read_input_tokens: 10, cache_creation_input_tokens: 5, output_tokens: 1 }, plain).fee).toBeCloseTo(44e-6, 12);
        expect(computeAnthropicCost(null, sonnet).fee).toBe(0);
    });
});

describe('partial cache_creation breakdown', () => {
    it('bills the part the breakdown leaves out as 5m writes', () => {
        const c = computeAnthropicCost({ input_tokens: 1, cache_creation_input_tokens: 1000, cache_creation: { ephemeral_5m_input_tokens: 100, ephemeral_1h_input_tokens: 200 } }, sonnet);
        expect(c.tokens_in).toBe(1001);
        expect(c.cache_write_tokens).toBe(1000);
        expect(c.fee).toBeCloseTo(1 * 2e-6 + 800 * 2.5e-6 + 200 * 4e-6, 12);
    });
});

describe('mergeAnthropicUsage', () => {
    it('keeps start values where the delta field is null or undefined, nested ones included', () => {
        const m = mergeAnthropicUsage(
            { input_tokens: 10, cache_read_input_tokens: 100, cache_creation: { ephemeral_5m_input_tokens: 7, ephemeral_1h_input_tokens: 3 }, output_tokens: 1 },
            { input_tokens: null as any, cache_read_input_tokens: null as any, output_tokens: 5, cache_creation: { ephemeral_5m_input_tokens: null as any, ephemeral_1h_input_tokens: 4 } });
        expect(m).toEqual({ input_tokens: 10, cache_read_input_tokens: 100, output_tokens: 5, cache_creation: { ephemeral_5m_input_tokens: 7, ephemeral_1h_input_tokens: 4 } });
        expect(computeAnthropicCost(m, sonnet).fee).toBeCloseTo(10 * 2e-6 + 100 * 0.1e-6 + 7 * 2.5e-6 + 4 * 4e-6 + 5 * 10e-6, 12);
    });
    it('merges stream usage: the delta wins, start keeps cache_creation', () => {
        expect(mergeAnthropicUsage({ input_tokens: 2, cache_creation: { ephemeral_5m_input_tokens: 9 }, output_tokens: 1 }, { output_tokens: 40 }))
            .toEqual({ input_tokens: 2, cache_creation: { ephemeral_5m_input_tokens: 9 }, output_tokens: 40 });
    });
    it('returns null when both sides are null', () => {
        expect(mergeAnthropicUsage(null, null)).toBeNull();
    });
});
