import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import BedrockConverse from '../src/providers/bedrock_converse';
import { HERMETIC_ENV } from './helpers/hermetic_env';

const request = (extra: any = {}) => ({ model: 'm', messages: [{ role: 'user', content: 'hi' }], ...extra });

async function inferenceConfigFor(config: any, extra: any = {}): Promise<any> {
    const provider: any = new BedrockConverse();
    const payload = await provider.chatMessageConverter.toPayload(request(extra), config);
    return payload.inferenceConfig;
}

describe('bedrock-converse sampling parameters for Claude models', () => {
    // Measured on Converse in us-east-1 on 2026-10-16: these models answer 400 "`temperature` is deprecated for
    // this model" (and the same for `top_p`), while Sonnet 4.6, Haiku 4.5 and older models accept both.
    it.each([
        'anthropic.claude-opus-4-20250514-v1:0',
        'us.anthropic.claude-opus-4-1-20250805-v1:0',
        'global.anthropic.claude-opus-4-8',
        'global.anthropic.claude-opus-5-5',
        'global.anthropic.claude-sonnet-5-5',
        'global.anthropic.claude-haiku-5-5',
        'us.anthropic.claude-sonnet-5',
        'anthropic.claude-fable-5',
    ])('sends neither temperature nor topP to %s', async (modelId) => {
        const inference = await inferenceConfigFor({ modelId });
        expect(inference).not.toHaveProperty('temperature');
        expect(inference).not.toHaveProperty('topP');
    });

    it('drops a temperature and top_p the client sent to a model that rejects them', async () => {
        const inference = await inferenceConfigFor({ modelId: 'global.anthropic.claude-opus-5-5' }, { temperature: 0.3, top_p: 0.9 });
        expect(inference).not.toHaveProperty('temperature');
        expect(inference).not.toHaveProperty('topP');
    });

    it('checks the base model id of an application inference profile', async () => {
        const inference = await inferenceConfigFor({
            modelId: 'arn:aws:bedrock:us-east-1:123456789012:application-inference-profile/abcdef',
            baseModelId: 'anthropic.claude-opus-5-5',
        });
        expect(inference).not.toHaveProperty('temperature');
        expect(inference).not.toHaveProperty('topP');
    });

    it.each([
        'global.anthropic.claude-sonnet-4-6',
        'global.anthropic.claude-haiku-4-5-20251001-v1:0',
        'anthropic.claude-sonnet-4-5-20250929-v1:0',
        'anthropic.claude-3-5-sonnet-20241022-v2:0',
    ])('keeps the default temperature for %s', async (modelId) => {
        const inference = await inferenceConfigFor({ modelId });
        expect(inference.temperature).toBe(0.7);
        expect(inference).not.toHaveProperty('topP');
    });

    it('keeps a temperature the client sent to a model that accepts it', async () => {
        const inference = await inferenceConfigFor({ modelId: 'global.anthropic.claude-sonnet-4-6' }, { temperature: 0.3 });
        expect(inference.temperature).toBe(0.3);
        expect(inference).not.toHaveProperty('topP');
    });

    it('with thinking on, sends no sampling parameters to a model that rejects them', async () => {
        const inference = await inferenceConfigFor({ modelId: 'global.anthropic.claude-opus-5-5', thinking: true, thinkBudget: 2048 });
        expect(inference).not.toHaveProperty('temperature');
        expect(inference).not.toHaveProperty('topP');
    });

    it('with thinking on, still sends temperature 1 to a model that accepts it', async () => {
        const inference = await inferenceConfigFor({ modelId: 'global.anthropic.claude-sonnet-4-6', thinking: true, thinkBudget: 2048 });
        expect(inference.temperature).toBe(1);
        expect(inference).not.toHaveProperty('topP');
    });

    it('leaves non-Claude models as they are', async () => {
        const inference = await inferenceConfigFor({ modelId: 'amazon.nova-pro-v1:0' });
        expect(inference).toMatchObject({ temperature: 0.7, topP: 0.7 });
    });
});

describe('bedrock-converse retries', () => {
    beforeEach(() => {
        for (const [name, value] of Object.entries(HERMETIC_ENV)) vi.stubEnv(name, value);
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });

    const ctx = () => ({ headers: {}, set() {}, logger: { error() {}, warn() {}, info() {} } });
    const model = { config: { modelId: 'global.anthropic.claude-opus-5-5', regions: ['us-east-1'] } };

    it('does not retry a ValidationException, and passes its message and status through', async () => {
        const rejected: any = Object.assign(new Error('The model returned the following errors: `temperature` is deprecated for this model.'), {
            name: 'ValidationException', $fault: 'client', $metadata: { httpStatusCode: 400, requestId: 'r-1' },
        });
        const send = vi.spyOn(BedrockRuntimeClient.prototype, 'send').mockRejectedValue(rejected as never);
        const provider: any = new BedrockConverse();
        provider.setModelData(structuredClone(model));
        await expect(provider.chat(request(), 's', ctx())).rejects.toMatchObject({
            name: 'ValidationException',
            message: 'The model returned the following errors: `temperature` is deprecated for this model.',
            $metadata: { httpStatusCode: 400 },
        });
        expect(send).toHaveBeenCalledTimes(1);
    });

    it('still retries a ValidationException when the model has several regions', async () => {
        const rejected: any = Object.assign(new Error('The provided model identifier is invalid.'), {
            name: 'ValidationException', $fault: 'client', $metadata: { httpStatusCode: 400 },
        });
        const send = vi.spyOn(BedrockRuntimeClient.prototype, 'send').mockRejectedValue(rejected as never);
        const provider: any = new BedrockConverse();
        provider.setModelData({ config: { ...model.config, regions: 'us-east-1, us-west-2' } });
        await expect(provider.chat(request(), 's', ctx())).rejects.toMatchObject({ name: 'ValidationException' });
        expect(send).toHaveBeenCalledTimes(4);
    });

    it('still retries a throttling error', async () => {
        const throttled: any = Object.assign(new Error('Too many requests'), {
            name: 'ThrottlingException', $fault: 'client', $metadata: { httpStatusCode: 429 },
        });
        const send = vi.spyOn(BedrockRuntimeClient.prototype, 'send').mockRejectedValue(throttled as never);
        const provider: any = new BedrockConverse();
        provider.setModelData(structuredClone(model));
        await expect(provider.chat(request(), 's', ctx())).rejects.toMatchObject({ name: 'ThrottlingException' });
        expect(send).toHaveBeenCalledTimes(4);
    });
});
