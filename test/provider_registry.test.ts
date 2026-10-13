import { describe, it, expect } from 'vitest';
import providers from '../src/providers/provider';
import BedrockRuntimeOpenAI from '../src/providers/bedrock_runtime_openai';

const k3 = { id: 5, name: 'kimi-k3', provider: 'bedrock-runtime-openai', multiple: 1, model_type: 1, price_in: 3e-6, price_out: 15e-6, config: { modelId: 'global.moonshotai.kimi-k3' } };
const ctxFor = (body: any) => ({ request: { body }, headers: {}, state: {} as any, user: { id: 1, group_id: 2, month_fee: '0', month_quota: '10', balance: '0', updated_at: new Date() }, db: { exists: async () => true }, cache: { models: [k3] } });

describe('provider registry', () => {
    it('registers bedrock-runtime-openai right after bedrock-converse', () => {
        const keys = Object.keys(providers);
        expect(keys.indexOf('bedrock-runtime-openai')).toBe(keys.indexOf('bedrock-converse') + 1);
    });
    it('hands each chat request its own model data', async () => {
        const ctx = ctxFor({ model: 'kimi-k3', messages: [{ role: 'user', content: 'hi' }] });
        const res = await providers.init(ctx);
        expect(res.provider).toBeInstanceOf(BedrockRuntimeOpenAI);
        expect(ctx.state.modelData).toBe(k3);
    });
    it('hands each Anthropic request its own model data', async () => {
        const ctx = ctxFor({ model: 'kimi-k3', max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] });
        await providers.initForAnthropic(ctx);
        expect(ctx.state.modelData).toBe(k3);
    });
});
