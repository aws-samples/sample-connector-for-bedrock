import { describe, it, expect } from 'vitest';
import helper from '../src/util/helper';
import models from '../src/models_data';

describe('NoDB Claude defaults', () => {
    it.each([
        ['claude-opus-5-5-chat', 'global.anthropic.claude-opus-5-5', 4e-6, 20e-6],
        ['claude-sonnet-5-5-chat', 'global.anthropic.claude-sonnet-5-5', 2e-6, 10e-6],
        ['claude-haiku-5-5-chat', 'global.anthropic.claude-haiku-5-5', 0.1e-6, 0.5e-6],
    ])('%s maps to bedrock-converse', (name, modelId, priceIn, priceOut) => {
        const m = helper.getModelDataWithoutDB(name);
        expect(m).toMatchObject({ name, provider: 'bedrock-converse', config: { modelId }, price_in: priceIn, price_out: priceOut });
        expect(models.map((e: any) => e.id)).toContain(name);
    });

    it('unknown model falls back to claude-haiku-5-5-chat', () => {
        expect(helper.getModelDataWithoutDB('nope').name).toBe('claude-haiku-5-5-chat');
    });

    it('lists no Claude 3.x models', () => {
        expect(models.some((e: any) => /claude-3/.test(e.id))).toBe(false);
    });
});
