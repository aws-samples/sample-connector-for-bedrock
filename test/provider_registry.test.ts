import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import providers from '../src/providers/provider';
import BedrockRuntimeOpenAI from '../src/providers/bedrock_runtime_openai';
import BedrockRuntimeAnthropic from '../src/providers/bedrock_runtime_anthropic';
import AbstractProvider from '../src/providers/abstract_provider';
import { HERMETIC_ENV } from './helpers/hermetic_env';

const k3 = { id: 5, name: 'kimi-k3', provider: 'bedrock-runtime-openai', multiple: 1, model_type: 1, price_in: 3e-6, price_out: 15e-6, config: { modelId: 'global.moonshotai.kimi-k3' } };
const claude = { id: 9, name: 'claude-sonnet-5-5', provider: 'bedrock-runtime-anthropic', multiple: 1, model_type: 1, price_in: 2e-6, price_out: 10e-6, config: { modelId: 'global.anthropic.claude-sonnet-5-5' } };
const userOf = (id: number) => ({ id, group_id: 2, month_fee: '0', month_quota: '10', balance: '0', updated_at: new Date() });
const userA = userOf(1);
const userB = userOf(3);
const modelA = { id: 7, name: 'model-a', provider: 'bedrock-converse', multiple: 1, model_type: 1, price_in: 1e-6, price_out: 2e-6, config: { modelId: 'anthropic.claude-test-a', regions: ['us-east-1'] } };
const modelB = { ...modelA, id: 8, name: 'model-b', config: { modelId: 'anthropic.claude-test-b', regions: ['us-east-1'] } };
const richModel = { ...modelA, created_at: new Date('2026-10-01T00:00:00Z'), config: { ...modelA.config, credentials: [{ accessKeyId: 'fake-a', secretAccessKey: 'fake-secret' }], promptCache: { fields: ['system'], messagePositions: [-1] } } };
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
        expect(ctx.state.modelData).toEqual(k3);
        expect(ctx.state.modelData).not.toBe(k3);
        expect(ctx.state.modelData).toBe(res.provider.modelData);
    });
    it('hands each Anthropic request its own model data', async () => {
        const ctx = ctxFor({ model: 'kimi-k3', max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] });
        await providers.initForAnthropic(ctx);
        expect(ctx.state.modelData).toEqual(k3);
        expect(ctx.state.modelData).not.toBe(k3);
    });

    it('registers bedrock-runtime-anthropic right after bedrock-runtime-openai', () => {
        const keys = Object.keys(providers);
        expect(keys.indexOf('bedrock-runtime-anthropic')).toBe(keys.indexOf('bedrock-runtime-openai') + 1);
    });

    describe('native /v1/messages dispatch', () => {
        const raw = () => ({ model: 'claude-sonnet-5-5', max_tokens: 10, system: [{ type: 'text', text: 's', cache_control: { type: 'ephemeral' } }], messages: [{ role: 'user', content: 'hi' }] });
        beforeEach(() => {
            for (const [name, value] of Object.entries(HERMETIC_ENV)) vi.stubEnv(name, value);
        });
        afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

        it('hands the raw body to the native provider without converting it', async () => {
            const spy = vi.spyOn(providers, 'convertAnthropicRequest');
            const body = raw();
            const ctx: any = ctxFor(body, { models: [claude] });
            ctx.headers['x-claude-code-session-id'] = 'cc-sess';
            const res: any = await providers.initForAnthropic(ctx);
            expect(spy).not.toHaveBeenCalled();
            expect(res).toMatchObject({ native: true, session_id: 'cc-sess' });
            expect(res.body).toBe(body);
            expect(res.chatRequest).toEqual({ model: 'claude-sonnet-5-5' });
            expect(res.provider).toBeInstanceOf(BedrockRuntimeAnthropic);
            expect(ctx.state.modelData).toEqual(claude);
            expect(ctx.state.modelData).not.toBe(claude);
        });
        it('prefers the session-id header over x-claude-code-session-id', async () => {
            const ctx: any = ctxFor(raw(), { models: [claude] });
            ctx.headers['session-id'] = 'explicit';
            ctx.headers['x-claude-code-session-id'] = 'cc-sess';
            expect((await providers.initForAnthropic(ctx)).session_id).toBe('explicit');
        });
        it('leaves a name/override model string untouched for the provider to reject', async () => {
            const body = { ...raw(), model: 'claude-sonnet-5-5/override' };
            const res: any = await providers.initForAnthropic(ctxFor(body, { models: [claude] }));
            expect(res.native).toBe(true);
            expect(res.body.model).toBe('claude-sonnet-5-5/override');
        });
        it('keeps the converse path: converts, and ignores x-claude-code-session-id', async () => {
            const spy = vi.spyOn(providers, 'convertAnthropicRequest');
            const ctx: any = ctxFor({ model: 'model-a', max_tokens: 10, messages: msgs }, { models: [modelA, claude] });
            ctx.headers['x-claude-code-session-id'] = 'cc-sess';
            const res: any = await providers.initForAnthropic(ctx);
            expect(spy).toHaveBeenCalledTimes(1);
            expect(res.native).toBe(false);
            expect(res.session_id).toBeUndefined();
            expect(res.chatRequest.model).toBe('model-a');
            expect(res.chatRequest.price_in).toBe(1e-6);
        });
        it('denies a native model the user may not access with a permission_error', async () => {
            const ctx: any = ctxFor(raw(), { models: [claude] });
            ctx.db = { exists: async () => false };
            await expect(providers.initForAnthropic(ctx)).rejects.toMatchObject({
                anthropicType: 'permission_error',
                message: 'You do not have permission to access the [claude-sonnet-5-5] model, please contact the administrator.',
            });
        });
        it('does not raise a TypeError for a missing model', async () => {
            const ctx: any = ctxFor({ max_tokens: 10, messages: msgs }, { models: [claude] });
            await expect(providers.initForAnthropic(ctx)).rejects.toMatchObject({ anthropicType: 'not_found_error' });
        });
        it('anthropicMessages calls messages() for the native provider', async () => {
            const spy = vi.spyOn(BedrockRuntimeAnthropic.prototype, 'messages').mockResolvedValue('done' as any);
            const body = raw();
            const ctx: any = ctxFor(body, { models: [claude] });
            ctx.headers['x-claude-code-session-id'] = 'cc-sess';
            await expect(providers.anthropicMessages(ctx)).resolves.toBe('done');
            expect(spy).toHaveBeenCalledTimes(1);
            expect(spy).toHaveBeenCalledWith(body, 'cc-sess', ctx);
        });
        it('anthropicMessages still calls chatAnthropic for a converse model', async () => {
            const ctx: any = ctxFor({ model: 'model-a', max_tokens: 10, messages: msgs }, { models: [modelA, claude] });
            const chatAnthropic = vi.fn().mockResolvedValue('conv');
            vi.spyOn(providers, 'initForAnthropic').mockResolvedValue({ provider: { chatAnthropic }, chatRequest: { model: 'model-a' }, session_id: 's', native: false, body: {} } as any);
            await expect(providers.anthropicMessages(ctx)).resolves.toBe('conv');
            expect(chatAnthropic).toHaveBeenCalledWith({ model: 'model-a' }, 's', ctx);
        });
    });

    it('keeps the registered provider names and their order', () => {
        expect(Object.keys(providers)).toEqual([
            'bedrock-converse', 'bedrock-runtime-openai', 'bedrock-runtime-anthropic', 'smart-router', 'sagemaker-lmi',
            'bedrock-knowledge-base', 'bedrock-agent', 'painter', 'nova-canvas', 'ollama',
            'continue-coder', 'titan-embeddings',
            'openai-compatible', 'bedrock-deepseek', 'sagemaker-deepseek', 'azure-openai',
            'azure-openai-image', 'gemini-converse',
        ]);
    });

    it('no longer registers the retired providers', () => {
        for (const name of ['aws-executor', 'urls-reader', 'web-miner']) expect((providers as any)[name]).toBeUndefined();
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

    describe.each(ENTRY_POINTS)('%s copy', (_name, call, body) => {
        it('gives the provider a copy of the cached model data', async () => {
            const ctx: any = ctxFor(body('model-a'), { models: [richModel] });
            const res: any = await call(ctx);
            expect(res.provider.modelData).toEqual(richModel);
            expect(res.provider.modelData).not.toBe(richModel);
            expect(res.provider.modelData.config).not.toBe(richModel.config);
            expect(res.provider.modelData.config.credentials).not.toBe(richModel.config.credentials);
            expect(res.provider.modelData.created_at).toEqual(richModel.created_at);
            expect(ctx.state.modelData).toBe(res.provider.modelData);
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

    describe('bedrock-converse chat', () => {
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

        it('a think-budget header on one request does not turn thinking on for the next', async () => {
            const cached = structuredClone(modelA);
            const run = async (budget?: string) => {
                const ctx: any = ctxFor({ model: 'model-a', messages: msgs }, { models: [cached] });
                ctx.set = vi.fn();
                ctx.logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() };
                if (budget) ctx.headers['think-budget'] = budget;
                const res: any = await providers.init(ctx);
                res.provider.chatSync = vi.fn().mockResolvedValue({ output: { message: { content: [{ text: 'ok' }] } }, usage: {}, metrics: {}, $metadata: {} });
                await res.provider.chat(res.chatRequest, undefined, ctx);
                return res.provider.chatSync.mock.calls[0][1];
            };
            const first = await run('2048');
            expect(first.additionalModelRequestFields.thinking).toEqual({ type: 'enabled', budget_tokens: 2048 });
            expect(cached.config).not.toHaveProperty('thinking');
            expect(cached.config).not.toHaveProperty('thinkBudget');
            const second = await run();
            expect(second.additionalModelRequestFields?.thinking).toBeUndefined();
        });
    });
});
