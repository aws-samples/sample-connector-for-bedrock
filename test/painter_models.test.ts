import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import Painter from '../src/providers/painter';
import BedrockConverse from '../src/providers/bedrock_converse';
import { ADD_KEY_FEE_SQL } from '../src/providers/key_fee';
import { S3PictureStore } from '../src/providers/painter_pictures';
import logger from '../src/util/logger';
import { fakeDb } from './helpers/fakes';
import { HERMETIC_ENV } from './helpers/hermetic_env';

const ULTRA = 'stability.stable-image-ultra-v1:1';
const REMOVE_BACKGROUND = 'us.stability.stable-image-remove-background-v1:0';
const STYLE_GUIDE = 'us.stability.stable-image-style-guide-v1:0';
const UNSUPPORTED = 'Unsupported paintModelId';

const solid = (alpha = 1) => sharp({ create: { width: 80, height: 80, channels: 4, background: { r: 200, g: 30, b: 30, alpha } } }).png().toBuffer();
const dataUrl = (bytes: Buffer) => `data:image/png;base64,${bytes.toString('base64')}`;
type Round = { text?: string; calls?: [string, object][] };

// The chat model answers with the given rounds in order; a text-only round ends the request.
function stubChat(rounds: Round[]) {
    const requests: any[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: any) => {
        requests.push(JSON.parse(init.body));
        const round = rounds[Math.min(requests.length - 1, rounds.length - 1)];
        const choices: any[] = [{ message: { role: 'assistant', content: round.text ?? '' } }];
        if (round.calls) {
            choices.push({ message: { tool_calls: round.calls.map(([name, args], i) => ({ id: `c${requests.length}${i}`, type: 'function', function: { name, arguments: JSON.stringify(args) } })) } });
        }
        return new Response(JSON.stringify({ choices }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));
    return requests;
}

function stubAws(respond: (modelId: string, body: any) => any | Promise<any> = async () => ({ images: [(await solid()).toString('base64')], finish_reasons: [null] })) {
    const invoked: { modelId: string; region: string; body: any }[] = [];
    const objects = new Map<string, Buffer>();
    const puts: any[] = [];
    vi.spyOn(BedrockRuntimeClient.prototype, 'send').mockImplementation((async function (this: any, command: any) {
        const body = JSON.parse(command.input.body);
        invoked.push({ modelId: command.input.modelId, region: await this.config.region(), body });
        return { body: new TextEncoder().encode(JSON.stringify(await respond(command.input.modelId, body))) };
    }) as any);
    vi.spyOn(S3Client.prototype, 'send').mockImplementation((async (command: any) => {
        if (command instanceof PutObjectCommand) {
            puts.push(command.input);
            objects.set(command.input.Key, command.input.Body as Buffer);
            return {};
        }
        if (command instanceof GetObjectCommand) {
            const bytes = objects.get(command.input.Key!);
            if (!bytes) throw new Error(`no such key ${command.input.Key}`);
            return { Body: { transformToByteArray: async () => new Uint8Array(bytes) } };
        }
        throw new Error('unexpected S3 command');
    }) as any);
    return { invoked, objects, puts };
}

const config = (extra: any = {}) => ({
    paintModelId: ULTRA, localLlmModel: 'claude-haiku-5-5-chat', s3Bucket: 'images-bucket', s3Region: 'us-west-2', s3Prefix: 'out', ...extra,
});

async function paint(messages: any[], opts: { config?: any; stream?: boolean; ctx?: (ctx: any) => void } = {}) {
    const painter: any = new Painter();
    painter.setModelData({ id: 9, name: 'paint', provider: 'painter', multiple: 1, model_type: 1, price_in: 0, price_out: 0, config: config(opts.config) });
    painter.setKeyData({ id: 5 });
    const chunks: string[] = [];
    const ctx: any = {
        db: fakeDb(), user: { id: 5, api_key: 'br-test' }, headers: {}, status: 404, body: undefined, set() {},
        res: { write: (s: string) => { chunks.push(String(s)); return true; }, end() {} },
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    };
    opts.ctx?.(ctx);
    await painter.chat({ model: 'paint', stream: opts.stream ?? true, currency: 'USD', messages }, 's-1', ctx);
    const text = chunks
        .filter((c) => c.startsWith('data: {'))
        .map((c) => JSON.parse(c.slice(6)).choices[0].delta.content ?? '')
        .join('');
    return { ctx, chunks, text, raw: chunks.join('') };
}

const charges = (ctx: any) => ctx.db.calls.filter((c: any[]) => c[0] === 'query' && c[1] === ADD_KEY_FEE_SQL).map((c: any[]) => c[2][0]);
const threads = (ctx: any) => ctx.db.calls.filter((c: any[]) => c[0] === 'insert' && c[1] === 'eiai_thread').map((c: any[]) => c[2]);
const imageParts = (message: any) => (Array.isArray(message.content) ? message.content.filter((p: any) => p.type === 'image_url') : []);

async function userWithPictures(text: string, count = 1) {
    const png = dataUrl(await solid());
    return { role: 'user', content: [{ type: 'text', text }, ...Array(count).fill(png).map((url) => ({ type: 'image_url', image_url: { url } }))] };
}

beforeEach(() => {
    for (const [name, value] of Object.entries(HERMETIC_ENV)) vi.stubEnv(name, value);
    vi.spyOn(logger, 'warn').mockImplementation((() => logger) as any);
    vi.spyOn(logger, 'error').mockImplementation((() => logger) as any);
});
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.useRealTimers();
});

describe('painter steps', () => {
    it.each([
        ['stability.stable-image-ultra-v1:1', 0.14],
        ['stability.stable-image-core-v1:1', 0.04],
        ['stability.sd3-5-large-v1:0', 0.08],
    ])('draws text to image with %s in us-west-2 and bills %s', async (modelId, price) => {
        stubChat([{ text: 'Drawing.', calls: [['txt2img', { prompt: 'a cat', negative_prompt: 'nsfw', aspect_ratio: '16:9' }]] }, { text: 'Here it is.' }]);
        const aws = stubAws();
        const { ctx, text } = await paint([{ role: 'user', content: 'a cat' }], { config: { paintModelId: modelId } });

        expect(aws.invoked).toEqual([{ modelId, region: 'us-west-2', body: { prompt: 'a cat', negative_prompt: 'nsfw', aspect_ratio: '16:9', output_format: 'jpeg' } }]);
        expect(aws.puts).toHaveLength(1);
        expect(aws.puts[0]).toMatchObject({ Bucket: 'images-bucket', ContentType: 'image/jpeg' });
        expect(aws.puts[0].Key).toMatch(/^out\/\d+-\d+-\d+\/\d+-.+\.jpg$/);
        expect(text).toContain(`> Step 1: txt2img with \`${modelId}\`, from text only`);
        expect(text).toContain('![image_1](https://images-bucket.s3.us-west-2.amazonaws.com/out/');
        expect(text.endsWith('Here it is.')).toBe(true);
        expect(charges(ctx)).toHaveLength(1);
        expect(charges(ctx)[0]).toBeCloseTo(price, 10);
    });

    it.each(['amazon.titan-image-generator-v2:0', 'amazon.nova-canvas-v1:0', 'my-model'])('answers %s with the supported models and does not call Bedrock', async (modelId) => {
        stubChat([{ calls: [['txt2img', { prompt: 'a cat' }]] }]);
        const aws = stubAws();
        const { text, ctx } = await paint([{ role: 'user', content: 'a cat' }], { config: { paintModelId: modelId } });
        expect(text).toContain(`> Error: ${UNSUPPORTED} ${modelId}. Use one of stability.stable-image-ultra-v1:1, stability.stable-image-core-v1:1, stability.sd3-5-large-v1:0.`);
        expect(text).not.toContain('![');
        expect(aws.invoked).toEqual([]);
        expect(aws.puts).toEqual([]);
        expect(charges(ctx)).toEqual([]);
    });

    it('chains remove_background and style_guide, streams each picture when it exists and bills both', async () => {
        const chat = stubChat([
            { text: 'Cutting it out.', calls: [['remove_background', { image_ref: 'image_1' }]] },
            { text: 'Now the style.', calls: [['style_guide', { prompt: 'a lake', image_ref: 'image_2' }]] },
            { text: 'All done.' },
        ]);
        let cutOut: string | undefined;
        const aws = stubAws(async (modelId) => {
            const image = (modelId === REMOVE_BACKGROUND ? await solid(0.5) : await solid()).toString('base64');
            if (modelId === REMOVE_BACKGROUND) cutOut = image;
            return { images: [image], finish_reasons: [null] };
        });
        vi.stubEnv('AWS_REGION', 'us-east-2');

        const { ctx, text, raw } = await paint([await userWithPictures('cut this out, then paint it like a lake')]);

        const order = [
            'Cutting it out.', '> Step 1: remove_background with `' + REMOVE_BACKGROUND + '`, from image_1', '![image_2](',
            'Now the style.', '> Step 2: style_guide with `' + STYLE_GUIDE + '`, from image_2', '![image_3](', 'All done.',
        ].map((needle) => text.indexOf(needle));
        expect(order.every((i) => i >= 0)).toBe(true);
        expect([...order].sort((a, b) => a - b)).toEqual(order);
        expect(raw.endsWith('data: [DONE]\n\n')).toBe(true);

        expect(aws.invoked.map((c) => [c.modelId, c.region])).toEqual([[REMOVE_BACKGROUND, 'us-east-2'], [STYLE_GUIDE, 'us-east-2']]);
        expect(aws.invoked[0].body).toEqual({ image: expect.any(String), output_format: 'png' });
        expect(aws.invoked[1].body).toEqual({ prompt: 'a lake', image: cutOut, output_format: 'jpeg' });

        expect(aws.puts.map((p) => p.Key.split('/').slice(0, 2).join('/').replace(/\d+-\d+-\d+/, 'DAY'))).toEqual(['out/uploads', 'out/DAY', 'out/DAY']);
        expect(aws.puts.map((p) => p.ContentType)).toEqual(['image/png', 'image/png', 'image/jpeg']);

        expect(chat).toHaveLength(3);
        expect(chat[0].model).toBe('claude-haiku-5-5-chat');
        expect(chat[0].tool_choice).toBe('auto');
        expect(chat[0].tools.map((t: any) => t.function.name)).toHaveLength(8);
        expect(chat[0].messages[0].role).toBe('system');
        expect(chat[0].messages[0].content).toContain('- image_1: uploaded in the latest message');
        expect(chat[2].messages[0].content).toContain('- image_3: made by painter');

        const attached = (request: any) => request.messages.filter((m: any) => m.role === 'user' && imageParts(m).length).map((m: any) => m.content[0].text);
        expect(attached(chat[0])).toEqual(['cut this out, then paint it like a lake']);
        expect(chat[1].messages.filter((m: any) => m.role === 'tool').map((m: any) => m.content)).toEqual(['image_2 is ready']);
        expect(attached(chat[1]).at(-1)).toBe('[image_2]');
        expect(attached(chat[2])).toContain('[image_3]');
        expect(attached(chat[2])).not.toContain('[image_2]');
        const kept = chat[2].messages.find((m: any) => m.role === 'user' && m.content[0]?.text === '[image_2]');
        expect(kept.content).toEqual([{ type: 'text', text: '[image_2]' }]);
        const assistant = chat[1].messages.find((m: any) => m.role === 'assistant');
        expect(assistant).toMatchObject({ content: 'Cutting it out.', tool_calls: [{ id: 'c10', type: 'function', function: { name: 'remove_background' } }] });
        expect(chat[1].messages.find((m: any) => m.role === 'tool').tool_call_id).toBe('c10');

        expect(charges(ctx)).toHaveLength(2);
        expect(charges(ctx)[0]).toBeCloseTo(0.07, 10);
        expect(charges(ctx)[1]).toBeCloseTo(0.07, 10);
        const [first, second] = threads(ctx);
        expect(threads(ctx)).toHaveLength(2);
        expect(first).toMatchObject({ tokens_in: 0, tokens_out: 0, session_key: 's-1' });
        expect(first.fee).toBeCloseTo(0.07, 10);
        expect(second.fee).toBeCloseTo(0.07, 10);
        expect(first.completion).toContain('> Step 1: remove_background');
        expect(first.completion).not.toContain('> Step 2');
        expect(second.completion).toContain('> Step 2: style_guide');
        expect(second.completion).not.toContain('> Step 1');
        expect(second.completion).not.toContain('All done.');
        expect(first.whole_prompt).toContain('s3://images-bucket/out/uploads/');
        expect(first.whole_prompt).not.toContain('base64');
        expect(second.whole_prompt).toBe(first.whole_prompt);
    });

    it('bills each picture at the price of its own model, config prices first', async () => {
        stubChat([{ calls: [['txt2img', { prompt: 'a' }], ['remove_background', { image_ref: 'image_1' }]] }, { text: 'ok' }]);
        stubAws();
        const { ctx } = await paint([{ role: 'user', content: 'x' }], { config: { image_prices: { [REMOVE_BACKGROUND]: '0.03' }, price_per_image: 0.5 } });
        expect(charges(ctx)).toHaveLength(2);
        expect(charges(ctx)[0]).toBeCloseTo(0.5, 10);
        expect(charges(ctx)[1]).toBeCloseTo(0.03, 10);
    });

    it('uses a picture made in an earlier turn by its presigned URL', async () => {
        const store = new S3PictureStore(new S3Client({ region: 'us-west-2' }), 'images-bucket', 'us-west-2', 'out');
        const earlier = await solid();
        const key = 'out/2026-1-1/earlier.jpg';
        const url = await store.presign(`s3://images-bucket/${key}`);
        const chat = stubChat([{ calls: [['remove_background', { image_ref: 'image_1' }]] }, { text: 'ok' }]);
        const aws = stubAws();
        aws.objects.set(key, earlier);

        await paint([
            { role: 'user', content: 'draw a cat' },
            { role: 'assistant', content: `Here.\n\n![](${url})` },
            { role: 'user', content: 'remove its background' },
        ]);

        expect(chat[0].messages.find((m: any) => m.role === 'assistant').content).toBe('Here.\n\n[image_1]');
        expect(aws.invoked[0].body.image).toBe(earlier.toString('base64'));
        expect(aws.puts.every((p) => !p.Key.includes('uploads'))).toBe(true);
    });

    it('streams the message of each filter result, stores nothing and does not bill it', async () => {
        for (const [reason, message] of [
            ['Filter reason: prompt', 'The prompt was filtered'],
            ['Filter reason: input image', 'An input picture was filtered'],
            ['Filter reason: output image', 'The generated picture was filtered'],
            ['Inference error', 'The image model failed to make the picture'],
        ]) {
            stubChat([{ calls: [['txt2img', { prompt: 'a cat' }]] }, { text: 'never asked' }]);
            const aws = stubAws(async () => ({ seeds: [1], finish_reasons: [reason] }));
            const { text, ctx, raw } = await paint([{ role: 'user', content: 'a cat' }]);
            expect(text).toContain(`> Error: ${message}`);
            expect(text).not.toContain('![');
            expect(text).not.toContain('never asked');
            expect(aws.puts).toEqual([]);
            expect(charges(ctx)).toEqual([]);
            expect(threads(ctx)).toEqual([]);
            expect(raw.endsWith('data: [DONE]\n\n')).toBe(true);
            vi.restoreAllMocks();
            vi.spyOn(logger, 'warn').mockImplementation((() => logger) as any);
        }
    });

    it('ends with the limit message at the sixth tool call and does not run it', async () => {
        stubChat([{ text: 'Six pictures.', calls: Array.from({ length: 6 }, () => ['txt2img', { prompt: 'a cat' }] as [string, object]) }]);
        const aws = stubAws();
        const { text, ctx } = await paint([{ role: 'user', content: 'six cats' }]);
        expect(aws.invoked).toHaveLength(5);
        expect(text).toContain('Reached the limit of 5 picture steps for one request. The pictures above are kept.');
        expect(text).toContain('> Step 5:');
        expect(text).not.toContain('> Step 6:');
        expect(text.match(/!\[image_\d\]/g)).toHaveLength(5);
        expect(charges(ctx)).toHaveLength(5);
        expect(charges(ctx).reduce((a: number, b: number) => a + b, 0)).toBeCloseTo(0.7, 10);
    });

    it('counts a step across rounds toward the limit', async () => {
        const chat = stubChat([{ calls: [['txt2img', { prompt: 'a cat' }]] }]);
        const aws = stubAws();
        const { text } = await paint([{ role: 'user', content: 'cats' }]);
        expect(aws.invoked).toHaveLength(5);
        expect(chat).toHaveLength(6);
        expect(text).toContain('Reached the limit of 5 picture steps');
    });

    it('starts no further step when the client has gone', async () => {
        stubChat([{ calls: [['txt2img', { prompt: 'a' }], ['txt2img', { prompt: 'b' }], ['txt2img', { prompt: 'c' }]] }]);
        let ctxRef: any;
        const aws = stubAws(async () => {
            ctxRef.res.destroyed = true;
            return { images: [(await solid()).toString('base64')], finish_reasons: [null] };
        });
        const { ctx } = await paint([{ role: 'user', content: 'x' }], { ctx: (c) => { ctxRef = c; } });
        expect(aws.invoked).toHaveLength(1);
        expect(charges(ctx)).toHaveLength(1);
        expect(charges(ctx)[0]).toBeCloseTo(0.14, 10);
    });

    it('makes no further chat call once the client has gone during a step', async () => {
        const chat = stubChat([{ calls: [['txt2img', { prompt: 'a' }]] }, { text: 'never asked' }]);
        let ctxRef: any;
        stubAws(async () => {
            ctxRef.res.destroyed = true;
            return { images: [(await solid()).toString('base64')], finish_reasons: [null] };
        });
        const { ctx, text } = await paint([{ role: 'user', content: 'x' }], { ctx: (c) => { ctxRef = c; } });
        expect(chat).toHaveLength(1);
        expect(text).not.toContain('never asked');
        expect(charges(ctx)).toHaveLength(1);
        expect(threads(ctx)).toHaveLength(1);
    });

    it('makes no chat call when the client is gone before the first one', async () => {
        const chat = stubChat([{ text: 'never asked' }]);
        const { ctx } = await paint([{ role: 'user', content: 'x' }], { ctx: (c) => { c.res.destroyed = true; } });
        expect(chat).toEqual([]);
        expect(charges(ctx)).toEqual([]);
    });

    it('charges the first picture and not the filtered second one', async () => {
        stubChat([{ text: 'Two steps.', calls: [['txt2img', { prompt: 'a' }], ['remove_background', { image_ref: 'image_1' }]] }]);
        stubAws(async (modelId) => (modelId === REMOVE_BACKGROUND
            ? { seeds: [1], finish_reasons: ['Filter reason: output image'] }
            : { images: [(await solid()).toString('base64')], finish_reasons: [null] }));
        const { ctx, text } = await paint([{ role: 'user', content: 'x' }]);
        expect(text).toContain('![image_1](');
        expect(text).toContain('> Error: The generated picture was filtered');
        expect(charges(ctx)).toHaveLength(1);
        expect(charges(ctx)[0]).toBeCloseTo(0.14, 10);
        expect(threads(ctx)).toHaveLength(1);
        expect(threads(ctx)[0].fee).toBeCloseTo(0.14, 10);
        expect(threads(ctx)[0].completion).not.toContain('filtered');
    });

    it('keeps the first picture charged when the chat model fails after it', async () => {
        let n = 0;
        vi.stubGlobal('fetch', vi.fn(async () => {
            n += 1;
            if (n === 2) return new Response('model overloaded', { status: 503 });
            const call = { id: 'a', type: 'function', function: { name: 'txt2img', arguments: '{"prompt":"a"}' } };
            return new Response(JSON.stringify({ choices: [{ message: { content: 'Drawing.', tool_calls: [call] } }] }), { status: 200 });
        }));
        stubAws();
        const { ctx, text, raw } = await paint([{ role: 'user', content: 'x' }]);
        expect(text).toContain('![image_1](');
        expect(text).toContain('> Error: model overloaded');
        expect(charges(ctx)).toHaveLength(1);
        expect(charges(ctx)[0]).toBeCloseTo(0.14, 10);
        expect(threads(ctx)).toHaveLength(1);
        expect(raw.endsWith('data: [DONE]\n\n')).toBe(true);
    });

    it('does not stop at a malformed URL in an assistant message of the history', async () => {
        const chat = stubChat([{ text: 'Hello.' }]);
        const { text } = await paint([
            { role: 'user', content: 'hi' },
            { role: 'assistant', content: 'see ![](https://example.com/%E0%A4%A?X-Amz-Signature=abc)' },
            { role: 'user', content: 'draw a cat' },
        ]);
        expect(chat).toHaveLength(1);
        expect(text).toBe('Hello.');
    });

    it('refuses an upload that breaks the limits before it calls the chat model', async () => {
        const chat = stubChat([{ text: 'should not be asked' }]);
        const aws = stubAws();
        const { text, ctx, raw } = await paint([await userWithPictures('too many', 6)]);
        expect(text).toBe('At most 5 pictures in one message; this one has 6.');
        expect(chat).toEqual([]);
        expect(aws.puts).toEqual([]);
        expect(charges(ctx)).toEqual([]);
        expect(threads(ctx)).toEqual([]);
        expect(raw.endsWith('data: [DONE]\n\n')).toBe(true);
    });

    it('says which Region may lack bedrock:InvokeModel when access is denied', async () => {
        stubChat([{ calls: [['remove_background', { image_ref: 'image_1' }]] }]);
        const error = Object.assign(new Error('not allowed'), { name: 'AccessDeniedException' });
        stubAws(async () => { throw error; });
        vi.stubEnv('AWS_REGION', 'eu-west-1');
        const { text, ctx } = await paint([await userWithPictures('cut it')]);
        expect(text).toContain('> Error: Access denied calling us.stability.stable-image-remove-background-v1:0. The role may lack bedrock:InvokeModel in us-west-2.');
        expect(charges(ctx)).toEqual([]);
    });

    it('streams the error of a bad tool call instead of throwing', async () => {
        stubChat([{ calls: [['draw', { prompt: 'a cat' }]] }]);
        const aws = stubAws();
        const { text } = await paint([{ role: 'user', content: 'a cat' }]);
        expect(text).toContain('> Error: The chat model asked for an unknown tool, draw.');
        stubChat([{ calls: [['img2img', { prompt: 'a cat', image_ref: 'image_9', strength: 0.5 }]] }]);
        const missing = await paint([{ role: 'user', content: 'a cat' }]);
        expect(missing.text).toMatch(/> Error: There is no picture named image_9\. .*localLlmModel/);
        expect(aws.invoked).toEqual([]);
    });

    it('surfaces an error of the chat model', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response('model overloaded', { status: 500 })));
        const { text, raw, ctx } = await paint([{ role: 'user', content: 'a cat' }]);
        expect(text).toContain('> Error: model overloaded');
        expect(raw.endsWith('data: [DONE]\n\n')).toBe(true);
        expect(charges(ctx)).toEqual([]);
    });

    it('answers a plain question without a picture step and without billing', async () => {
        stubChat([{ text: 'Hello there.' }]);
        const aws = stubAws();
        const { text, ctx } = await paint([{ role: 'user', content: 'hi' }]);
        expect(text).toBe('Hello there.');
        expect(aws.invoked).toEqual([]);
        expect(charges(ctx)).toEqual([]);
    });
});

describe('painter behind the bedrock-converse chat provider', () => {
    it('makes both pictures when one converse answer holds two tool calls', async () => {
        const converter = new BedrockConverse();
        const prompts = ['red lighthouse', 'blue lighthouse'];
        let asked = 0;
        vi.stubGlobal('fetch', vi.fn(async (_url: string, init: any) => {
            asked += 1;
            if (asked > 1) return new Response(JSON.stringify({ choices: [{ message: { content: 'Both are ready.' } }] }), { status: 200 });
            const body = converter.chatSyncBody({
                output: { message: { role: 'assistant', content: [
                    { text: 'Drawing both.' },
                    ...prompts.map((prompt, i) => ({ toolUse: { toolUseId: `tool-${i}`, name: 'txt2img', input: { prompt } } })),
                ] } },
                usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
                $metadata: { requestId: 'req-1' },
            } as any, JSON.parse(init.body));
            return new Response(JSON.stringify(body), { status: 200 });
        }));
        const aws = stubAws();
        const { text, ctx } = await paint([{ role: 'user', content: 'a red lighthouse and a blue lighthouse' }]);

        expect(aws.invoked.map((call) => call.body.prompt)).toEqual(prompts);
        expect(text).toContain('![image_1](');
        expect(text).toContain('![image_2](');
        expect(text).toContain('Both are ready.');
        expect(charges(ctx)).toHaveLength(2);
    });
});

// A keep-alive is a normal chunk that carries no text, so a client that parses every data line accepts it.
const emptyChunks = (chunks: string[]) => chunks
    .filter((c) => c.startsWith('data: {'))
    .map((c) => JSON.parse(c.slice(6)))
    .filter((chunk) => chunk.choices[0].delta.content === '');

describe('painter keep-alive', () => {
    it('writes an empty-content chunk every 15 seconds while Bedrock is slow, and stops afterwards', async () => {
        vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
        stubChat([{ calls: [['txt2img', { prompt: 'a cat' }]] }, { text: 'done' }]);
        let release!: () => void;
        const slow = new Promise<void>((resolve) => { release = resolve; });
        const aws = stubAws(async () => {
            await slow;
            return { images: [(await solid()).toString('base64')], finish_reasons: [null] };
        });

        const running = paint([{ role: 'user', content: 'a cat' }]);
        const watch = new Promise<void>((resolve) => {
            const poll = () => (aws.invoked.length ? resolve() : setImmediate(poll));
            poll();
        });
        await watch;
        expect(vi.getTimerCount()).toBeGreaterThan(0);
        await vi.advanceTimersByTimeAsync(15_000);
        await vi.advanceTimersByTimeAsync(15_000);
        release();
        const { raw, chunks, ctx } = await running;
        expect(emptyChunks(chunks)).toHaveLength(2);
        expect(raw).not.toContain(': keep-alive');
        const recorded = threads(ctx).map((t: any) => t.completion).join('');
        expect(recorded).toContain('> Step 1');
        expect(recorded).not.toContain('chatcmpl');
        expect(vi.getTimerCount()).toBe(0);
    });
});

describe('painter keep-alive on the chat call', () => {
    it('writes an empty-content chunk while the chat model is slow', async () => {
        vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
        let release!: () => void;
        const slow = new Promise<void>((resolve) => { release = resolve; });
        let started = false;
        vi.stubGlobal('fetch', vi.fn(async () => {
            started = true;
            await slow;
            return new Response(JSON.stringify({ choices: [{ message: { content: 'Hi.' } }] }), { status: 200 });
        }));

        const running = paint([{ role: 'user', content: 'hi' }]);
        await vi.waitFor(() => expect(started).toBe(true));
        await vi.advanceTimersByTimeAsync(15_000);
        release();
        const { raw, text, chunks } = await running;
        expect(emptyChunks(chunks)).toHaveLength(1);
        expect(raw).not.toContain(': keep-alive');
        expect(text).toBe('Hi.');
        expect(vi.getTimerCount()).toBe(0);
    });
});

describe('painter without stream', () => {
    it('only forwards the request to the chat API', async () => {
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'A title' } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
        vi.stubGlobal('fetch', fetchMock);
        const aws = stubAws();
        const { ctx } = await paint([await userWithPictures('name this chat')], { stream: false });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const sent = JSON.parse((fetchMock.mock.calls[0] as any)[1].body);
        expect(sent).toMatchObject({ model: 'claude-haiku-5-5-chat', stream: false });
        expect(sent).not.toHaveProperty('tools');
        expect(sent.messages[0].content[1].image_url.url).toMatch(/^data:image\/png;base64,/);
        expect(ctx.body).toEqual({ choices: [{ message: { content: 'A title' } }] });
        expect(aws.invoked).toEqual([]);
        expect(aws.puts).toEqual([]);
        expect(ctx.db.calls).toEqual([]);
    });
});
