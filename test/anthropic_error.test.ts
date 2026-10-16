import { describe, it, expect, vi } from 'vitest';
import { toAnthropicError, withAnthropicType, isAnthropicPath } from '../src/util/anthropic_error';
import { errorFromResponse, BedrockHttpError } from '../src/providers/bedrock_openai/transport';
import { errorHandler, authHandler } from '../src/middleware/handlers';
import providers from '../src/providers/provider';
import helper from '../src/util/helper';
import modelService from '../src/service/model';

const rejection = async (run: () => Promise<unknown>): Promise<any> => {
    try {
        await run();
    } catch (ex) {
        return ex;
    }
    throw new Error('expected a rejection');
};

describe('toAnthropicError', () => {
    it.each([
        ['authentication_error', 401], ['billing_error', 402], ['permission_error', 403], ['not_found_error', 404], ['invalid_request_error', 400],
        ['request_too_large', 413], ['rate_limit_error', 429], ['api_error', 500], ['timeout_error', 504], ['overloaded_error', 529],
    ])('a tagged %s error answers %i', (type, status) => {
        expect(toAnthropicError(withAnthropicType(new Error('m'), type as any))).toEqual({ status, body: { type: 'error', error: { type, message: 'm' } }, headers: {} });
    });
    it("passes Bedrock's Anthropic error through with retry-after", () => {
        const ex = errorFromResponse(429, '{"type":"error","error":{"type":"rate_limit_error","message":"Too many tokens"}}', 'rid', { 'retry-after': '3' });
        expect(toAnthropicError(ex)).toEqual({ status: 429, body: { type: 'error', error: { type: 'rate_limit_error', message: 'Too many tokens' } }, headers: { 'retry-after': '3' } });
    });
    it.each([[503, 'overloaded_error'], [502, 'api_error'], [504, 'timeout_error'], [403, 'permission_error'], [429, 'rate_limit_error']])('types an untyped %i as %s', (status, type) => {
        expect(toAnthropicError(errorFromResponse(status, '<html>bad gateway</html>')).body.error.type).toBe(type);
        expect(toAnthropicError({ message: 'sdk', $metadata: { httpStatusCode: status } }).status).toBe(status);
    });
    it('does not pass a non-JSON upstream page through as the message', () => {
        const { body } = toAnthropicError(errorFromResponse(502, '<html>bad gateway</html>'));
        expect(body.error.message).toBe('Bedrock returned HTTP 502.');
        expect(body.error.message).not.toContain('<html');
    });
    it('keeps the upstream message of a JSON body that is not in Anthropic format', () => {
        expect(toAnthropicError(errorFromResponse(429, '{"message":"Too many requests"}')).body.error.message).toBe('Too many requests');
    });
    it('keeps the own message of an error without an upstream body', () => {
        const ex = new BedrockHttpError(502, "Bedrock's stream broke off before its first event: x");
        expect(toAnthropicError(ex).body.error).toEqual({ type: 'api_error', message: "Bedrock's stream broke off before its first event: x" });
    });
    it('keeps an unclassified error at 400 invalid_request_error', () => {
        expect(toAnthropicError(new Error('boom'))).toMatchObject({ status: 400, body: { error: { type: 'invalid_request_error', message: 'boom' } } });
    });
    it('forwards only retry-after and x-should-retry', () => {
        const ex = Object.assign(new Error('m'), { statusCode: 429, headers: { 'retry-after': '1', 'x-should-retry': 'true', 'set-cookie': 'x' } });
        expect(toAnthropicError(ex).headers).toEqual({ 'retry-after': '1', 'x-should-retry': 'true' });
    });
    it('tagging changes neither the message nor the name', () => {
        const error = new TypeError('m');
        expect(withAnthropicType(error, 'api_error')).toBe(error);
        expect(error.message).toBe('m');
        expect(error.name).toBe('TypeError');
    });
});

describe('isAnthropicPath', () => {
    it('matches /v1/messages and what is under it only', () => {
        expect(isAnthropicPath('/v1/messages')).toBe(true);
        expect(isAnthropicPath('/v1/messages/count_tokens')).toBe(true);
        expect(isAnthropicPath('/v1/messagesx')).toBe(false);
        expect(isAnthropicPath('/v1/chat/completions')).toBe(false);
    });
});

describe('errorHandler', () => {
    it('answers /v1/messages in Anthropic format and leaves other routes as they are', async () => {
        const run = async (path: string) => {
            const ctx: any = { path, res: { on() {} }, logger: { error() {} }, set(h: any) { this.h = h; } };
            await errorHandler(ctx, async () => { throw withAnthropicType(new Error('Unauthorized: api key error.'), 'authentication_error'); });
            return ctx;
        };
        expect((await run('/v1/messages')).status).toBe(401);
        expect((await run('/v1/messages')).body).toEqual({ type: 'error', error: { type: 'authentication_error', message: 'Unauthorized: api key error.' } });
        const other = await run('/v1/chat/completions');
        expect(other.status).toBe(400);
        expect(other.body.success).toBe(false);
    });
    it('sets the retry headers on /v1/messages', async () => {
        const ctx: any = { path: '/v1/messages', res: { on() {} }, logger: { error() {} }, set(h: any) { this.h = h; } };
        await errorHandler(ctx, async () => { throw errorFromResponse(429, '{"error":{"message":"slow down"}}', 'rid', { 'retry-after': '7' }); });
        expect(ctx.status).toBe(429);
        expect(ctx.h).toEqual({ 'retry-after': '7' });
        expect(ctx.body.error).toEqual({ type: 'rate_limit_error', message: 'slow down' });
    });
});

describe('the errors a /v1/messages request can hit before the model is called', () => {
    it('tags a missing api key as authentication_error', async () => {
        const ctx: any = { path: '/v1/messages', header: {} };
        expect((await rejection(() => authHandler(ctx, async () => {}))).anthropicType).toBe('authentication_error');
    });
    it('tags an unknown api key as authentication_error', async () => {
        const ctx: any = { path: '/v1/messages', header: { 'x-api-key': 'nope' }, cache: { api_keys: [] } };
        expect((await rejection(() => authHandler(ctx, async () => {}))).anthropicType).toBe('authentication_error');
    });
    it('tags a request without a usable key store as authentication_error', async () => {
        const ctx: any = { path: '/v1/messages', header: { 'x-api-key': 'nope' } };
        expect((await rejection(() => authHandler(ctx, async () => {}))).anthropicType).toBe('authentication_error');
    });
    it('tags an exhausted quota as billing_error', async () => {
        const key = { id: 1, month_fee: '5', month_quota: '5', balance: '0', updated_at: new Date() };
        expect((await rejection(() => providers.checkFee({}, key))).anthropicType).toBe('billing_error');
    });
    it('tags a model the key may not use as permission_error', async () => {
        const model = { id: 5, name: 'kimi-k3', provider: 'bedrock-runtime-openai', multiple: 1, model_type: 1, price_in: 3e-6, price_out: 15e-6, config: { modelId: 'global.moonshotai.kimi-k3' } };
        const ctx: any = {
            request: { body: { model: 'kimi-k3', max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] } }, headers: {}, state: {},
            user: { id: 1, group_id: 2, month_fee: '0', month_quota: '10', balance: '0', updated_at: new Date() },
            db: { exists: async () => false }, cache: { models: [model] },
        };
        expect((await rejection(() => providers.initForAnthropic(ctx))).anthropicType).toBe('permission_error');
    });
    it('tags an unknown model as not_found_error when the cache is used', async () => {
        const ctx: any = { cache: { models: [] }, db: {} };
        const ex = await rejection(() => helper.refineModelParameters({ model: 'nope' } as any, ctx));
        expect(ex.message).toBe('The model [nope] not found.');
        expect(ex.anthropicType).toBe('not_found_error');
    });
    it('tags an unknown model as not_found_error when only the db is used', async () => {
        const spy = vi.spyOn(modelService, 'loadByName').mockResolvedValue(undefined as any);
        try {
            const ex = await rejection(() => helper.refineModelParameters({ model: 'nope' } as any, { db: {} }));
            expect(ex.anthropicType).toBe('not_found_error');
        } finally {
            spy.mockRestore();
        }
    });
});
