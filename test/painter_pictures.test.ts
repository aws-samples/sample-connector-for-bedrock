import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import {
    PictureStore, S3PictureStore, STABILITY_LIMITS, UPLOAD_LIMITS, chatCopy, collectPictures, fitForStability, presignedS3Url,
} from '../src/providers/painter_pictures';
import { PaintStepError } from '../src/providers/painter_tools';
import { S3_IMAGE_OUTSIDE_BUCKET } from '../src/util/preprocess';
import { HERMETIC_ENV } from './helpers/hermetic_env';

const BUCKET = 'images-bucket';
const REGION = 'us-west-2';

const solid = (width: number, height: number, format: 'jpeg' | 'png' | 'webp' | 'gif' = 'png', alpha = 1) =>
    sharp({ create: { width, height, channels: 4, background: { r: 200, g: 30, b: 30, alpha } } }).toFormat(format).toBuffer();
const dataUrl = (bytes: Uint8Array, mime = 'image/png') => `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
const imagePart = (url: string) => ({ type: 'image_url', image_url: { url } });

function memoryStore() {
    const objects = new Map<string, Uint8Array>();
    const puts: { format: string; folder: string }[] = [];
    const store: PictureStore = {
        bucket: BUCKET,
        region: REGION,
        async put(bytes, format, folder) {
            const url = `s3://${BUCKET}/${folder}/${objects.size + 1}.${format}`;
            objects.set(url, bytes);
            puts.push({ format, folder });
            return url;
        },
        async get(url) {
            return objects.get(url)!;
        },
    };
    return { store, objects, puts };
}

const s3Store = (prefix = 'out') => new S3PictureStore(new S3Client({ region: REGION }), BUCKET, REGION, prefix);

beforeEach(() => {
    for (const [name, value] of Object.entries(HERMETIC_ENV)) vi.stubEnv(name, value);
});
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
});

describe('upload limits', () => {
    it('refuses a message with six pictures and stores nothing', async () => {
        const { store, puts } = memoryStore();
        const png = dataUrl(await solid(80, 80));
        const result = await collectPictures([{ role: 'user', content: [{ type: 'text', text: 'hi' }, ...Array(6).fill(png).map(imagePart)] }], store);
        expect(result).toEqual({ refusal: `At most ${UPLOAD_LIMITS.count} pictures in one message; this one has 6.` });
        expect(puts).toEqual([]);
    });

    it('refuses a picture over 10 MB and says its size', async () => {
        const { store, puts } = memoryStore();
        const big = dataUrl(Buffer.alloc(11 * 1024 * 1024));
        const result = await collectPictures([{ role: 'user', content: [imagePart(dataUrl(await solid(80, 80))), imagePart(big)] }], store);
        expect(result).toEqual({ refusal: 'Picture 2 is 11.0 MB; the limit is 10 MB per picture.' });
        expect(puts).toEqual([]);
    });

    it('refuses a picture that cannot be decoded and names the formats that work', async () => {
        const { store, puts } = memoryStore();
        const garbage = dataUrl(Buffer.from('....ftypheic not really a picture'), 'image/heic');
        const result: any = await collectPictures([{ role: 'user', content: [imagePart(garbage)] }], store);
        expect(result.refusal).toBe('Picture 1 cannot be read, for example HEIC; upload JPEG, PNG or WebP.');
        expect(puts).toEqual([]);
    });

    it('counts only the last user message: earlier pictures are named but not stored', async () => {
        const { store, puts } = memoryStore();
        const png = dataUrl(await solid(80, 80));
        const result: any = await collectPictures([
            { role: 'user', content: [...Array(6).fill(png).map(imagePart)] },
            { role: 'assistant', content: 'ok' },
            { role: 'user', content: [{ type: 'text', text: 'again' }, imagePart(png)] },
        ], store);
        expect(result.refusal).toBeUndefined();
        expect(puts).toEqual([{ format: 'png', folder: 'uploads' }]);
        expect(result.book.describe()).toContain('- image_7: uploaded in the latest message');
        expect(result.book.describe()).toContain('- image_1: uploaded earlier in the conversation');
    });
});

describe('picture names', () => {
    it('names pictures in order of appearance across user and assistant messages', async () => {
        const { store, objects } = memoryStore();
        const s3 = s3Store();
        const generatedUrl = await s3.presign(`s3://${BUCKET}/out/2026-1-1/a.jpg`);
        const png = await solid(80, 80);
        const result: any = await collectPictures([
            { role: 'user', content: [{ type: 'text', text: 'first' }, imagePart(dataUrl(png))] },
            { role: 'assistant', content: `Done.\n\n![](${generatedUrl})` },
            { role: 'user', content: [{ type: 'text', text: 'now this' }, imagePart(dataUrl(png))] },
        ], store);

        expect(result.chatMessages[0].content.map((p: any) => p.type)).toEqual(['text', 'text', 'image_url']);
        expect(result.chatMessages[0].content[1]).toEqual({ type: 'text', text: '[image_1]' });
        expect(result.chatMessages[0].content[2].image_url.url).toMatch(/^data:image\/jpeg;base64,/);
        expect(result.chatMessages[1].content).toBe('Done.\n\n[image_2]');
        expect(result.chatMessages[2].content[1]).toEqual({ type: 'text', text: '[image_3]' });

        const stored = [...objects.keys()];
        expect(stored).toHaveLength(1);
        expect(result.threadMessages[0].content).toEqual([{ type: 'text', text: 'first' }, { type: 'text', text: '[image_1]' }]);
        expect(result.threadMessages[1].content).toContain('![](https://');
        expect(result.threadMessages[2].content[1]).toEqual({ type: 'text', text: `[image_3] ${stored[0]}` });

        expect(await result.book.resolve('image_2')).toBe(`s3://${BUCKET}/out/2026-1-1/a.jpg`);
        expect(await result.book.resolve('[image_3]')).toBe(stored[0]);
    });

    it('leaves a presigned URL of another bucket, an unsigned URL and a plain https picture alone', async () => {
        const { store } = memoryStore();
        const other = await new S3PictureStore(new S3Client({ region: REGION }), 'other-bucket', REGION, '').presign('s3://other-bucket/x.jpg');
        const unsigned = `https://${BUCKET}.s3.${REGION}.amazonaws.com/out/a.jpg`;
        const content = `A ![](${other}) B ![](${unsigned})`;
        const result: any = await collectPictures([
            { role: 'assistant', content },
            { role: 'user', content: [imagePart('https://example.com/cat.png')] },
        ], store);
        expect(result.chatMessages[0].content).toBe(content);
        expect(result.chatMessages[1].content).toEqual([imagePart('https://example.com/cat.png')]);
        expect(result.book.describe()).toBe('- none');
    });

    it('does not change the messages it was given', async () => {
        const { store } = memoryStore();
        const messages: any[] = [{ role: 'user', content: [imagePart(dataUrl(await solid(80, 80)))] }];
        const before = JSON.stringify(messages);
        await collectPictures(messages, store);
        expect(JSON.stringify(messages)).toBe(before);
    });
});

describe('resolve', () => {
    it('stores an earlier upload on first use, once', async () => {
        const { store, puts } = memoryStore();
        const png = dataUrl(await solid(80, 80));
        const result: any = await collectPictures([
            { role: 'user', content: [imagePart(png)] },
            { role: 'assistant', content: 'ok' },
            { role: 'user', content: 'and now?' },
        ], store);
        expect(puts).toEqual([]);
        const first = await result.book.resolve('image_1');
        const second = await result.book.resolve('image_1');
        expect(first).toBe(second);
        expect(puts).toEqual([{ format: 'png', folder: 'uploads' }]);
    });

    it('passes an s3:// reference through and explains an unknown name', async () => {
        const { store } = memoryStore();
        const result: any = await collectPictures([{ role: 'user', content: 'hi' }], store);
        expect(await result.book.resolve('s3://images-bucket/a.png')).toBe('s3://images-bucket/a.png');
        await expect(result.book.resolve('image_4')).rejects.toThrow(/localLlmModel/);
        await expect(result.book.resolve('image_4')).rejects.toBeInstanceOf(PaintStepError);
    });

    it('registers a generated picture under the next name', async () => {
        const { store } = memoryStore();
        const result: any = await collectPictures([{ role: 'user', content: [imagePart(dataUrl(await solid(80, 80)))] }], store);
        expect(result.book.add('generated', `s3://${BUCKET}/out/b.jpg`)).toBe('image_2');
        expect(await result.book.resolve('image_2')).toBe(`s3://${BUCKET}/out/b.jpg`);
    });

    it('refuses an earlier upload over 10 MB when a tool uses it', async () => {
        const { store } = memoryStore();
        const big = dataUrl(Buffer.alloc(11 * 1024 * 1024));
        const result: any = await collectPictures([
            { role: 'user', content: [imagePart(big)] },
            { role: 'user', content: 'again' },
        ], store);
        await expect(result.book.resolve('image_1')).rejects.toThrow('Picture image_1 is 11.0 MB; the limit is 10 MB per picture.');
    });
});

describe('S3PictureStore', () => {
    it('writes uploads and generated pictures under dated keys with the content type', async () => {
        const sent: any[] = [];
        vi.spyOn(S3Client.prototype, 'send').mockImplementation((async (command: any) => {
            if (command instanceof PutObjectCommand) sent.push(command.input);
            return {};
        }) as any);
        const store = s3Store('out');
        const up = await store.put(Buffer.from('a'), 'jpeg', 'uploads');
        const gen = await store.put(Buffer.from('b'), 'png', 'generated');
        expect(up).toMatch(new RegExp(`^s3://${BUCKET}/out/uploads/\\d+-\\d+-\\d+/\\d+-[0-9a-f-]{36}\\.jpg$`));
        expect(gen).toMatch(new RegExp(`^s3://${BUCKET}/out/\\d+-\\d+-\\d+/\\d+-[0-9a-f-]{36}\\.png$`));
        expect(sent.map((s) => [s.Bucket, s.ContentType])).toEqual([[BUCKET, 'image/jpeg'], [BUCKET, 'image/png']]);

        expect(await s3Store('').put(Buffer.from('c'), 'webp', 'generated')).toMatch(new RegExp(`^s3://${BUCKET}/\\d+-\\d+-\\d+/.+\\.webp$`));
        expect(await s3Store('').put(Buffer.from('c'), 'webp', 'uploads')).toMatch(new RegExp(`^s3://${BUCKET}/uploads/\\d+-`));
    });

    it('presigns for four hours and reads back the same URL as s3://', async () => {
        const url = await s3Store().presign(`s3://${BUCKET}/out/2026-1-1/a b.jpg`);
        expect(new URL(url).searchParams.get('X-Amz-Expires')).toBe('14400');
        expect(presignedS3Url(url, BUCKET, REGION)).toBe(`s3://${BUCKET}/out/2026-1-1/a b.jpg`);
        expect(presignedS3Url(url, 'other-bucket', REGION)).toBeUndefined();
        expect(presignedS3Url(url, BUCKET, 'us-east-1')).toBeUndefined();
        expect(presignedS3Url('not a url', BUCKET, REGION)).toBeUndefined();
        expect(presignedS3Url(`https://${BUCKET}.s3.${REGION}.amazonaws.com/%E0%A4%A?X-Amz-Signature=abc`, BUCKET, REGION)).toBeUndefined();
    });

    it('refuses to read from another bucket with a 400 and sends nothing', async () => {
        const send = vi.spyOn(S3Client.prototype, 'send');
        const error: any = await s3Store().get('s3://other-bucket/a.png').catch((e) => e);
        expect(error.message).toBe(S3_IMAGE_OUTSIDE_BUCKET);
        expect(error.statusCode).toBe(400);
        expect(send).not.toHaveBeenCalled();
    });
});

describe('chatCopy', () => {
    it('makes a JPEG with the longest side at 1024 px and a white background for transparency', async () => {
        const copy = await chatCopy(await solid(3000, 2000, 'png', 0));
        expect(copy).toMatch(/^data:image\/jpeg;base64,/);
        const out = sharp(Buffer.from(copy.split(',')[1], 'base64'));
        expect(await out.metadata()).toMatchObject({ format: 'jpeg', width: 1024, height: 683 });
        const [r, g, b] = (await out.raw().toBuffer()).subarray(0, 3);
        expect([r, g, b].every((v) => v > 250)).toBe(true);
    });

    it('applies the EXIF orientation', async () => {
        const rotated = await sharp(await solid(200, 100, 'jpeg')).withMetadata({ orientation: 6 }).toBuffer();
        const out = await sharp(Buffer.from((await chatCopy(rotated)).split(',')[1], 'base64')).metadata();
        expect([out.width, out.height]).toEqual([100, 200]);
    });
});

describe('fitForStability', () => {
    const decode = (base64: string) => sharp(Buffer.from(base64, 'base64'));

    it('passes a picture inside the limits through untouched', async () => {
        const png = await solid(300, 200, 'png', 0.5);
        expect(await fitForStability('image_1', png)).toBe(png.toString('base64'));
    });

    it('keeps the alpha of a PNG that must be scaled down', async () => {
        const out = decode(await fitForStability('image_1', await solid(3000, 3000, 'png', 0)));
        const meta = await out.metadata();
        expect(meta.format).toBe('png');
        expect(meta.width! * meta.height!).toBeLessThanOrEqual(STABILITY_LIMITS.maxPixels);
        expect(meta.width).toBe(meta.height);
        const { data, info } = await out.raw().toBuffer({ resolveWithObject: true });
        expect(info.channels).toBe(4);
        expect(data[3]).toBe(0);
    });

    it('scales a 3000 x 3000 JPEG under the pixel limit and keeps JPEG', async () => {
        const meta = await decode(await fitForStability('image_1', await solid(3000, 3000, 'jpeg'))).metadata();
        expect(meta.format).toBe('jpeg');
        expect(meta.width! * meta.height!).toBeLessThanOrEqual(4_194_304);
        expect(meta.width!).toBeGreaterThan(2000);
    });

    it('keeps the ratio at or under 2.5:1 when it scales a wide picture down', async () => {
        const meta = await decode(await fitForStability('image_1', await solid(5000, 2000, 'jpeg'))).metadata();
        expect(meta.width! / meta.height!).toBeLessThanOrEqual(STABILITY_LIMITS.maxRatio);
        expect(meta.width! * meta.height!).toBeLessThanOrEqual(STABILITY_LIMITS.maxPixels);
    });

    it('turns a readable format Stability does not take into PNG', async () => {
        expect((await decode(await fitForStability('image_1', await solid(100, 100, 'gif'))).metadata()).format).toBe('png');
    });

    it('applies the EXIF orientation even when no scaling is needed', async () => {
        const rotated = await sharp(await solid(200, 100, 'jpeg')).withMetadata({ orientation: 6 }).toBuffer();
        const meta = await decode(await fitForStability('image_1', rotated)).metadata();
        expect([meta.width, meta.height]).toEqual([100, 200]);
    });

    it('rejects a side under 64 px and says the size', async () => {
        const error: any = await fitForStability('image_2', await solid(50, 400)).catch((e) => e);
        expect(error).toBeInstanceOf(PaintStepError);
        expect(error.message).toContain('image_2');
        expect(error.message).toContain('50x400 px');
        expect(error.message).toContain('at least 64 px');
    });

    it('rejects an aspect ratio over 2.5 and says the size', async () => {
        const error: any = await fitForStability('image_3', await solid(3000, 1000)).catch((e) => e);
        expect(error).toBeInstanceOf(PaintStepError);
        expect(error.message).toContain('3000x1000 px');
        expect(error.message).toContain('1:2.5 and 2.5:1');
        await expect(fitForStability('image_3', await solid(250, 100))).resolves.toBeTypeOf('string');
    });

    it('rejects bytes that are not a picture', async () => {
        await expect(fitForStability('image_1', Buffer.from('nope'))).rejects.toThrow(/cannot be read/);
    });
});
