import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'crypto';
import sharp from 'sharp';
import { BedrockRuntimeClient, ConverseCommand, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import v1 from '../src/controller/runtime/v1';
import { authHandler, errorHandler } from '../src/middleware/handlers';
import { ADD_KEY_FEE_SQL } from '../src/providers/key_fee';
import { PAINTER_CHAT_GRANT_HEADER, issuePainterChatGrant, redeemPainterChatGrant } from '../src/providers/painter_chat_grant';
import logger from '../src/util/logger';
import { selfBaseUrl } from '../src/util/self';
import { fakeDb } from './helpers/fakes';
import { HERMETIC_ENV } from './helpers/hermetic_env';

const CHAT = { id: 31, name: 'claude-sonnet-5-5-chat', provider: 'bedrock-converse', multiple: 1, model_type: 1, price_in: 2e-6, price_out: 10e-6, config: { modelId: 'global.anthropic.claude-sonnet-5-5', regions: ['us-east-1'] } };
const PAINTER = { id: 30, name: 'painter', provider: 'painter', multiple: 1, model_type: 1, price_in: 0, price_out: 0, config: { paintModelId: 'stability.stable-image-ultra-v1:1', localLlmModel: CHAT.name } };
const keyOf = (id: number) => ({ id, group_id: 2, api_key: `br-key-${id}`, month_fee: '0', month_quota: '10', balance: '0', updated_at: new Date() });
const PAINTER_ONLY = keyOf(5);
const OTHER_KEY = keyOf(6);
const REFUSED = `You do not have permission to access the [${CHAT.name}] model, please contact the administrator.`;

const grantsOnly = (model: { id: number }) => async (_table: string, c: any) => c.params[1] === model.id;

let db: ReturnType<typeof fakeDb>;
let picture: string;

async function gateway(headers: Record<string, string>, body: any) {
    const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
    const chunks: string[] = [];
    const ctx: any = {
        path: '/v1/chat/completions', header: lower, headers: lower, request: { body }, state: {}, status: 200, body: undefined, set() {},
        db, cache: { api_keys: [PAINTER_ONLY, OTHER_KEY], models: [PAINTER, CHAT] },
        res: { destroyed: false, writableEnded: false, on() {}, write: (s: string) => { chunks.push(String(s)); return true; }, end() {} },
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    };
    await errorHandler(ctx, () => authHandler(ctx, () => v1.chat_completions(ctx)));
    const text = chunks.filter((c) => c.startsWith('data: {')).map((c) => JSON.parse(c.slice(6)).choices[0].delta.content ?? '').join('');
    return { ctx, text };
}

function loopbackIntoGateway() {
    const sent: Record<string, string>[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: any) => {
        if (url !== `${selfBaseUrl}/v1/chat/completions`) return new Response('', { status: 404 });
        sent.push(init.headers);
        const { ctx } = await gateway(init.headers, JSON.parse(init.body));
        return new Response(JSON.stringify(ctx.body), { status: ctx.status, headers: { 'Content-Type': 'application/json' } });
    }));
    return sent;
}

function stubAws(rounds: { text: string; draw?: object }[]) {
    const converse: any[] = [];
    vi.spyOn(BedrockRuntimeClient.prototype, 'send').mockImplementation((async (command: any) => {
        if (command instanceof ConverseCommand) {
            const round = rounds[Math.min(converse.length, rounds.length - 1)];
            converse.push(command.input);
            const content: any[] = [{ text: round.text }];
            if (round.draw) content.push({ toolUse: { toolUseId: `t${converse.length}`, name: 'txt2img', input: round.draw } });
            return {
                output: { message: { role: 'assistant', content } }, stopReason: round.draw ? 'tool_use' : 'end_turn',
                usage: { inputTokens: 100, outputTokens: 10, totalTokens: 110 }, metrics: { latencyMs: 5 }, $metadata: { requestId: 'r-1' },
            };
        }
        if (command instanceof InvokeModelCommand) {
            return { body: new TextEncoder().encode(JSON.stringify({ images: [picture], finish_reasons: [null] })) };
        }
        throw new Error('unexpected Bedrock command');
    }) as any);
    vi.spyOn(S3Client.prototype, 'send').mockImplementation((async (command: any) => {
        if (command instanceof PutObjectCommand) return {};
        throw new Error('unexpected S3 command');
    }) as any);
    return { converse };
}

const chargedKeys = () => db.calls.filter((c: any[]) => c[0] === 'query' && c[1] === ADD_KEY_FEE_SQL).map((c: any[]) => c[2][2]);
const asKey = (key: { api_key: string }, extra: Record<string, string> = {}) => ({ Authorization: `Bearer ${key.api_key}`, 'Session-Id': 's-1', ...extra });
const askChatModelDirectly = (grant?: string) =>
    gateway(asKey(PAINTER_ONLY, grant === undefined ? {} : { [PAINTER_CHAT_GRANT_HEADER]: grant }), { model: CHAT.name, messages: [{ role: 'user', content: 'hi' }] });

beforeAll(async () => {
    picture = (await sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 10, g: 120, b: 200 } } }).png().toBuffer()).toString('base64');
});
beforeEach(() => {
    for (const [name, value] of Object.entries(HERMETIC_ENV)) vi.stubEnv(name, value);
    vi.stubEnv('PAINTER_S3_BUCKET', 'stack-bucket');
    vi.stubEnv('PAINTER_S3_REGION', 'us-west-2');
    vi.stubEnv('PAINTER_S3_PREFIX', 'painter');
    vi.spyOn(logger, 'warn').mockImplementation((() => logger) as any);
    vi.spyOn(logger, 'error').mockImplementation((() => logger) as any);
    db = { ...fakeDb(), exists: grantsOnly(PAINTER) } as any;
});
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.useRealTimers();
});

describe('a key granted only painter', () => {
    it('draws: painter reaches its chat model on every call, and every charge goes to that key', async () => {
        const aws = stubAws([{ text: 'Drawing.', draw: { prompt: 'a cat' } }, { text: 'Here it is.' }]);
        const sent = loopbackIntoGateway();

        const { ctx, text } = await gateway(asKey(PAINTER_ONLY), { model: 'painter', stream: true, messages: [{ role: 'user', content: 'a cat' }] });

        expect(text).not.toContain('Error');
        expect(text).toContain('![image_1](https://stack-bucket.s3.us-west-2.amazonaws.com/painter/');
        expect(text.endsWith('Here it is.')).toBe(true);
        expect(ctx.status).toBe(200);
        expect(aws.converse).toHaveLength(2);
        expect(chargedKeys()).toEqual([PAINTER_ONLY.id, PAINTER_ONLY.id, PAINTER_ONLY.id]);

        const grants = sent.map((headers) => headers[PAINTER_CHAT_GRANT_HEADER]);
        expect(grants).toHaveLength(2);
        expect(new Set(grants).size).toBe(2);
        expect(sent.every((headers) => headers.Authorization === `Bearer ${PAINTER_ONLY.api_key}`)).toBe(true);
        for (const grant of grants) expect((await askChatModelDirectly(grant)).ctx.body).toMatchObject({ success: false, data: REFUSED });
        expect(aws.converse).toHaveLength(2);
    });

    it('gets an answer from painter without a stream, charged to that key', async () => {
        const aws = stubAws([{ text: 'A title' }]);
        const sent = loopbackIntoGateway();

        const { ctx } = await gateway(asKey(PAINTER_ONLY), { model: 'painter', stream: false, messages: [{ role: 'user', content: 'name this chat' }] });

        expect(ctx.status).toBe(200);
        expect(ctx.body.choices[0].message.content).toBe('A title');
        expect(aws.converse).toHaveLength(1);
        expect(sent.map((headers) => typeof headers[PAINTER_CHAT_GRANT_HEADER])).toEqual(['string']);
        expect(chargedKeys()).toEqual([PAINTER_ONLY.id]);
    });

    it.each([
        ['no grant', () => undefined],
        ['a made-up grant', () => crypto.randomBytes(32).toString('base64url')],
        ['a grant issued for another key', () => issuePainterChatGrant(OTHER_KEY.id, CHAT.name)],
        ['a grant issued for another model', () => issuePainterChatGrant(PAINTER_ONLY.id, 'claude-haiku-5-5-chat')],
    ])('is refused the chat model when it asks for it directly with %s', async (_what, grant) => {
        const aws = stubAws([{ text: 'unused' }]);
        const { ctx } = await askChatModelDirectly(grant());
        expect(ctx.status).toBe(400);
        expect(ctx.body).toMatchObject({ success: false, data: REFUSED });
        expect(aws.converse).toEqual([]);
        expect(chargedKeys()).toEqual([]);
    });

    it('is refused the chat model with a grant it already used once', async () => {
        const aws = stubAws([{ text: 'ok' }]);
        const grant = issuePainterChatGrant(PAINTER_ONLY.id, CHAT.name);
        expect((await askChatModelDirectly(grant)).ctx.status).toBe(200);
        const { ctx } = await askChatModelDirectly(grant);
        expect(ctx.body).toMatchObject({ success: false, data: REFUSED });
        expect(aws.converse).toHaveLength(1);
    });

    it.each([
        [59_999, 200],
        [60_001, 400],
    ])('with a grant used %i ms after it was issued gets status %i', async (later, status) => {
        stubAws([{ text: 'ok' }]);
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(Date.now());
        const grant = issuePainterChatGrant(PAINTER_ONLY.id, CHAT.name);
        vi.setSystemTime(Date.now() + later);
        const { ctx } = await askChatModelDirectly(grant);
        expect(ctx.status).toBe(status);
        if (status === 400) expect(ctx.body).toMatchObject({ success: false, data: REFUSED });
    });
});

describe('a model grant', () => {
    it('is used up by a lookup with the wrong model, so it cannot be tried again', () => {
        const grant = issuePainterChatGrant(5, 'chat-model');
        expect(redeemPainterChatGrant(grant, 5, 'other-model')).toBe(false);
        expect(redeemPainterChatGrant(grant, 5, 'chat-model')).toBe(false);
    });

    it.each([undefined, null, 42, ['token']])('is not found for the header value %j', (value) => {
        expect(redeemPainterChatGrant(value, 5, 'chat-model')).toBe(false);
    });
});
