import { describe, it, expect, beforeEach, vi } from 'vitest';
import providers from '../src/providers/provider';
import BedrockRuntimeOpenAI from '../src/providers/bedrock_runtime_openai';
import AbstractProvider from '../src/providers/abstract_provider';
import { HERMETIC_ENV } from './helpers/hermetic_env';

const k3 = { id: 5, name: 'kimi-k3', provider: 'bedrock-runtime-openai', multiple: 1, model_type: 1, price_in: 3e-6, price_out: 15e-6, config: { modelId: 'global.moonshotai.kimi-k3' } };
const userOf = (id: number) => ({ id, group_id: 2, month_fee: '0', month_quota: '10', balance: '0', updated_at: new Date() });
const userA = userOf(1);
const userB = userOf(3);
const modelA = { id: 7, name: 'model-a', provider: 'bedrock-converse', multiple: 1, model_type: 1, price_in: 1e-6, price_out: 2e-6, config: { modelId: 'anthropic.claude-test-a', regions: ['us-east-1'] } };
const modelB = { ...modelA, id: 8, name: 'model-b', config: { modelId: 'anthropic.claude-test-b', regions: ['us-east-1'] } };
const ctxFor = (body: any, opts: { user?: any; models?: any[] } = {}) => ({ request: { body }, headers: {}, state: {} as any, user: opts.user ?? userA, db: { exists: async () => true }, cache: { models: opts.models ?? [k3] } });

const msgs = [{ role: 'user', content: 'hi' }];
const ENTRY_POINTS: [string, (ctx: any) => Promise<any>, (model: string) => any][] = [
    ['init', (ctx) => providers.init(ctx), (model) => ({ model, messages: msgs })],
    ['initForAnthropic', (ctx) => providers.initForAnthropic(ctx), (model) => ({ model, max_tokens: 10, messages: msgs })],
    ['initForEmbeddings', (ctx) => providers.initForEmbeddings(ctx), (model) => ({ model, input: 'hi' })],
    ['initForImage', (ctx) => providers.initForImage(ctx), (model) => ({ model, prompt: 'a cat' })],
];

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

    it('keeps the registered provider names and their order', () => {
        expect(Object.keys(providers)).toEqual([
            'bedrock-converse', 'bedrock-runtime-openai', 'smart-router', 'sagemaker-lmi',
            'bedrock-knowledge-base', 'bedrock-agent', 'painter', 'nova-canvas', 'ollama',
            'web-miner', 'continue-coder', 'urls-reader', 'aws-executor', 'titan-embeddings',
            'openai-compatible', 'bedrock-deepseek', 'sagemaker-deepseek', 'azure-openai',
            'azure-openai-image', 'gemini-converse',
        ]);
    });

    describe.each(ENTRY_POINTS)('%s', (_name, call, body) => {
        it('gives each request its own provider, model data and key data', async () => {
            const a: any = await call(ctxFor(body('model-a'), { user: userA, models: [modelA, modelB] }));
            const b: any = await call(ctxFor(body('model-b'), { user: userB, models: [modelA, modelB] }));
            expect(a.provider).not.toBe(b.provider);
            expect(a.provider.modelData.name).toBe('model-a');
            expect(a.provider.keyData.id).toBe(1);
            expect(b.provider.modelData.name).toBe('model-b');
            expect(b.provider.keyData.id).toBe(3);
        });
    });

    it.each(['no-such-provider', 'init', 'chat', 'constructor', 'toString', '__proto__'])(
        'rejects provider name %s', async (name) => {
            const model = { ...modelA, name: 'odd', provider: name };
            const ctx = ctxFor({ model: 'odd', messages: msgs }, { models: [model] });
            await expect(providers.init(ctx)).rejects.toThrow('You need to configure the provider correctly.');
        });

    it('constructs every registered provider without arguments', () => {
        for (const name of Object.keys(providers)) {
            const first = providers.createProvider(name);
            expect(first, name).toBeInstanceOf(AbstractProvider);
            expect(providers.createProvider(name), name).not.toBe(first);
        }
    });

    describe('retry', () => {
        beforeEach(() => {
            for (const [name, value] of Object.entries(HERMETIC_ENV)) vi.stubEnv(name, value);
        });

        it('retries a failing bedrock-converse request maxRetry times', async () => {
            const ctx: any = ctxFor({ model: 'model-a', messages: msgs }, { models: [modelA] });
            ctx.set = vi.fn();
            ctx.logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() };
            const res: any = await providers.init(ctx);
            res.provider.chatSync = vi.fn().mockRejectedValue(new Error('boom'));
            await expect(res.provider.chat(res.chatRequest, undefined, ctx))
                .rejects.toThrow('Maximum retry attempts (3) exceeded. Last error: boom');
            expect(res.provider.chatSync).toHaveBeenCalledTimes(4);
        });
    });
});
