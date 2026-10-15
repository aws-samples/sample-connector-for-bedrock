import { describe, it, expect } from 'vitest';
import { buildRequestBody, baseModelId } from '../src/providers/bedrock_openai/request_body';

const K3 = 'global.moonshotai.kimi-k3';
const req = (extra: any = {}) => ({ model: 'kimi-k3', messages: [{ role: 'user', content: 'hi' }], ...extra });

describe('buildRequestBody', () => {
    it('strips BRConnector fields and sends the configured model id', () => {
        const { body } = buildRequestBody(req({ model_id: 'x', currency: 'USD', price_in: 3e-6, price_out: 1.5e-5, temperature: 0 }), K3);
        expect(body).toEqual({ model: K3, messages: [{ role: 'user', content: 'hi' }], temperature: 0 });
    });
    it('passes unknown fields through untouched', () => {
        const messages = [{ role: 'system', content: [{ type: 'text', text: 'ctx', prompt_cache_breakpoint: { mode: 'explicit' } }] }];
        const { body } = buildRequestBody(req({ messages, prompt_cache_options: { mode: 'explicit' }, reasoning_effort: 'low', thinking: { type: 'disabled' } }), K3);
        expect(body).toMatchObject({ messages, prompt_cache_options: { mode: 'explicit' }, reasoning_effort: 'low', thinking: { type: 'disabled' } });
    });
    it('removes service_tier', () => {
        expect(buildRequestBody(req({ service_tier: 'priority' }), K3).body).not.toHaveProperty('service_tier');
    });
    it('leaves the client request unchanged', () => {
        const r = req({ model_id: 'x', price_in: 1, stream: true });
        buildRequestBody(r, K3);
        expect(r).toEqual(req({ model_id: 'x', price_in: 1, stream: true }));
    });
    it('always asks Bedrock for usage on streams', () => {
        expect(buildRequestBody(req({ stream: true }), K3)).toMatchObject({ body: { stream_options: { include_usage: true } }, clientWantsUsage: false });
        expect(buildRequestBody(req({ stream: true, stream_options: { include_usage: true } }), K3).clientWantsUsage).toBe(true);
        expect(buildRequestBody(req({ stream: true, stream_options: { include_usage: false } }), K3)).toMatchObject({ body: { stream_options: { include_usage: true } }, clientWantsUsage: false });
    });
    it('drops stream_options on non-stream requests', () => {
        const built = buildRequestBody(req({ stream_options: { include_usage: true } }), K3);
        expect(built.body).not.toHaveProperty('stream_options');
        expect(built.clientWantsUsage).toBe(false);
    });
    // The provider picks the stream path by truthiness, so Bedrock must be told the same thing.
    it('sends any truthy stream as true, with usage requested', () => {
        for (const stream of [true, 'false', 1]) {
            const { body } = buildRequestBody(req({ stream }), K3);
            expect(body.stream).toBe(true);
            expect(body.stream_options.include_usage).toBe(true);
        }
    });
    it('sends no stream field when stream is falsy', () => {
        for (const stream of [false, 0, '', null]) {
            expect(buildRequestBody(req({ stream }), K3).body).not.toHaveProperty('stream');
        }
    });
    it('renames max_tokens for GPT-5.6 and later', () => {
        const gpt61 = buildRequestBody(req({ max_tokens: 100 }), 'us.openai.gpt-6.1-sol').body;
        expect(gpt61).toMatchObject({ max_completion_tokens: 100 });
        expect(gpt61).not.toHaveProperty('max_tokens');
        expect(buildRequestBody(req({ max_tokens: 100 }), 'global.openai.gpt-5.6-sol').body.max_completion_tokens).toBe(100);
        expect(buildRequestBody(req({ max_tokens: 100, max_completion_tokens: 50 }), 'global.openai.gpt-6-luna').body.max_completion_tokens).toBe(50);
        expect(buildRequestBody(req({ max_tokens: 100 }), 'openai.gpt-oss-120b-1:0').body.max_tokens).toBe(100);
    });
    it('drops top_p for Kimi K3 only', () => {
        expect(buildRequestBody(req({ top_p: 1 }), K3).body).not.toHaveProperty('top_p');
        expect(buildRequestBody(req({ top_p: 1 }), 'moonshotai.kimi-k2.5').body.top_p).toBe(1);
    });
});

describe('baseModelId', () => {
    it('strips one cross-Region prefix and nothing else', () => {
        expect(baseModelId('global.moonshotai.kimi-k3')).toBe('moonshotai.kimi-k3');
        expect(baseModelId('us-gov.openai.gpt-oss-120b-1:0')).toBe('openai.gpt-oss-120b-1:0');
        expect(baseModelId('moonshotai.kimi-k3')).toBe('moonshotai.kimi-k3');
        expect(baseModelId('arn:aws:bedrock:us-east-1:acct:application-inference-profile/abc')).toBe('arn:aws:bedrock:us-east-1:acct:application-inference-profile/abc');
    });
});
