import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import Painter from '../src/providers/painter';
import logger from '../src/util/logger';
import { fakeDb } from './helpers/fakes';
import { HERMETIC_ENV } from './helpers/hermetic_env';

const SUPPORTED = ['stability.stable-image-ultra-v1:1', 'stability.stable-image-core-v1:1', 'stability.sd3-5-large-v1:0'];

function stubPromptCall(args: any) {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
        choices: [
            { message: { role: 'assistant', content: 'Drawing it now.' } },
            { message: { tool_calls: [{ type: 'function', function: { name: 'draw', arguments: JSON.stringify(args) } }] } },
        ],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
}

function stubBedrock() {
    const sent: any[] = [];
    vi.spyOn(BedrockRuntimeClient.prototype, 'send').mockImplementation((async (command: any) => {
        sent.push({ modelId: command.input.modelId, body: JSON.parse(command.input.body) });
        return { body: new TextEncoder().encode(JSON.stringify({ images: ['aGk='] })) };
    }) as any);
    const uploads: any[] = [];
    vi.spyOn(S3Client.prototype, 'send').mockImplementation((async (command: any) => {
        if (command instanceof PutObjectCommand) uploads.push(command.input);
        return {};
    }) as any);
    return { sent, uploads };
}

async function paint(paintModelId: string) {
    const painter: any = new Painter();
    painter.setModelData({
        id: 9, name: 'paint', provider: 'painter', multiple: 1, model_type: 1, price_in: 0, price_out: 0,
        config: { paintModelId, localLlmModel: 'claude-haiku-5-5-chat', s3Bucket: 'images-bucket', s3Region: 'us-west-2', s3Prefix: 'out', regions: ['us-west-2'] },
    });
    painter.setKeyData({ id: 5 });
    const chunks: string[] = [];
    const ctx: any = {
        db: fakeDb(), user: { id: 5, api_key: 'br-test' }, headers: {}, status: 404, set() {},
        res: { write: (s: string) => { chunks.push(String(s)); return true; }, end() {} },
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    };
    await painter.chat({ model: 'paint', stream: true, currency: 'USD', messages: [{ role: 'user', content: 'a cat' }] }, 's-1', ctx);
    return chunks.join('');
}

beforeEach(() => {
    for (const [name, value] of Object.entries(HERMETIC_ENV)) vi.stubEnv(name, value);
});
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

describe('painter paint models', () => {
    it.each([
        ['stability.stable-image-ultra-v1:1', { negative_prompt: 'nsfw' }],
        ['stability.stable-image-core-v1:1', { mode: 'text-to-image' }],
        ['stability.sd3-5-large-v1:0', {}],
    ])('sends %s a text-to-image request with the nearest aspect ratio', async (modelId, extra) => {
        for (const [size, aspect_ratio] of [[{ width: 1024, height: 576 }, '16:9'], [{ width: 3000, height: 1000 }, '21:9'], [{}, '1:1']] as const) {
            stubPromptCall({ prompt: 'a cat', negative_prompt: 'nsfw', ...size });
            const { sent, uploads } = stubBedrock();
            const out = await paint(modelId);
            expect(sent).toEqual([{ modelId, body: { prompt: 'a cat', aspect_ratio, output_format: 'jpg', ...extra } }]);
            expect(uploads).toHaveLength(1);
            expect(uploads[0]).toMatchObject({ Bucket: 'images-bucket', Body: Buffer.from('hi') });
            expect(out).toContain('![](https://images-bucket.s3.us-west-2.amazonaws.com/out/');
            vi.restoreAllMocks();
        }
    });

    it.each(['amazon.titan-image-generator-v2:0', 'amazon.nova-canvas-v1:0', 'my-model'])('answers %s with the supported models and does not call Bedrock', async (modelId) => {
        stubPromptCall({ prompt: 'a cat', width: 512, height: 512 });
        const { sent, uploads } = stubBedrock();
        vi.spyOn(logger, 'error').mockImplementation((() => logger) as any);
        const out = await paint(modelId);
        expect(out).toContain(`> Error: Unsupported paintModelId. Use one of ${SUPPORTED.join(', ')}.`);
        expect(out).not.toContain('![](');
        expect(sent).toEqual([]);
        expect(uploads).toEqual([]);
    });
});
