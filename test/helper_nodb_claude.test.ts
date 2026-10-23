import { describe, it, expect } from 'vitest';
import helper, { MODEL_ID_OVERRIDE_MESSAGE } from '../src/util/helper';
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

    it('a name/<id> string gets the override error instead of the fallback model', async () => {
        await expect(helper.refineModelParameters({ model: 'x/y' } as any, {})).rejects.toMatchObject({
            message: MODEL_ID_OVERRIDE_MESSAGE, anthropicType: 'invalid_request_error',
        });
    });

    it('an unknown name without "/" still falls back to claude-haiku-5-5-chat', async () => {
        expect((await helper.refineModelParameters({ model: 'nope' } as any, {})).name).toBe('claude-haiku-5-5-chat');
    });

    it('lists no Claude 3.x models', () => {
        expect(models.some((e: any) => /claude-3/.test(e.id))).toBe(false);
    });
});
