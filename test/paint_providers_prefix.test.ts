import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import providers from '../src/providers/provider';
import { HERMETIC_ENV } from './helpers/hermetic_env';

const modelData = { name: 'paint', config: { paintModelId: 'p', localLlmModel: 'l', s3Bucket: 'b', s3Region: 'us-east-1', s3Prefix: 'images/' } };
const makeCtx = () => ({
    headers: {}, set: vi.fn(), state: {} as any, user: { api_key: 'br-test' },
    res: { write: vi.fn(), end: vi.fn() },
    logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
});

describe('paint providers', () => {
    beforeEach(() => {
        for (const [name, value] of Object.entries(HERMETIC_ENV)) vi.stubEnv(name, value);
    });
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
    });

    it('painter trims a trailing slash from s3Prefix', async () => {
        const keys: string[] = [];
        vi.spyOn(S3Client.prototype, 'send').mockImplementation((async (command: any) => {
            if (command instanceof PutObjectCommand) keys.push(command.input.Key!);
            return {};
        }) as any);
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 })));
        const png = await sharp({ create: { width: 80, height: 80, channels: 3, background: '#fff' } }).png().toBuffer();
        const provider: any = providers.createProvider('painter');
        provider.setModelData(modelData);
        const request: any = {
            model: 'paint', stream: true,
            messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: `data:image/png;base64,${png.toString('base64')}` } }] }],
        };
        await provider.chat(request, undefined, makeCtx());
        expect(keys).toHaveLength(1);
        expect(keys[0]).toMatch(/^images\/uploads\/\d+-\d+-\d+\/\d+-.+\.png$/);
    });
});
