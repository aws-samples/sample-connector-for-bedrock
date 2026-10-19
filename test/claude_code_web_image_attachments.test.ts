import { describe, expect, it, vi } from 'vitest';
import {
    ALLOWED_IMAGE_TYPES,
    JPEG_QUALITY,
    MAX_IMAGE_BASE64,
    MAX_IMAGE_EDGE,
    MAX_IMAGES_PER_MESSAGE,
    MAX_TOTAL_BASE64,
    PNG_MAX_BYTES,
    base64ByteLength,
    buildUserMessage,
    fitWithin,
    hasDraggedFiles,
    imageBlockToDataUrl,
    isImageDataUrl,
    parseImageDataUrl,
    pickDroppedImages,
    pickPastedImages,
    prepareImage,
    splitImageContent,
    takeImageSlots,
    totalSizeError,
} from '../claude-code-web/web_client/src/utils/imageAttachments.js';

const MiB = 1024 * 1024;

// Base64 text that decodes to exactly n bytes (all zero bytes).
function b64OfBytes(n: number) {
    const tail = n % 3 === 1 ? 'AA==' : n % 3 === 2 ? 'AAA=' : '';
    return 'A'.repeat(4 * Math.floor(n / 3)) + tail;
}

function dataUrl(mediaType: string, data: string) {
    return `data:${mediaType};base64,${data}`;
}

// A codec whose encoder returns base64 of a chosen length per media type.
function fakeCodec({ width = 800, height = 600, png = b64OfBytes(1000), jpeg = b64OfBytes(500), decodeError = null as Error | null } = {}) {
    const source = { width, height, close: vi.fn() };
    return {
        source,
        decode: vi.fn(async () => {
            if (decodeError) throw decodeError;
            return source;
        }),
        encode: vi.fn(async (_src: unknown, _w: number, _h: number, mediaType: string) =>
            dataUrl(mediaType, mediaType === 'image/png' ? png : jpeg)),
    };
}

function file(type: string, name = 'shot.png') {
    return { type, name };
}

describe('limits', () => {
    it('match the task limits exactly', () => {
        expect(ALLOWED_IMAGE_TYPES).toEqual(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
        expect(MAX_IMAGES_PER_MESSAGE).toBe(5);
        expect(MAX_IMAGE_EDGE).toBe(1568);
        expect(PNG_MAX_BYTES).toBe(1 * MiB);
        expect(JPEG_QUALITY).toBe(0.85);
        expect(MAX_IMAGE_BASE64).toBe(3.75 * MiB);
        expect(MAX_TOTAL_BASE64).toBe(4.5 * MiB);
        // The whole send stays well under Lambda's 6 MB synchronous request cap.
        expect(MAX_TOTAL_BASE64).toBeLessThan(6 * MiB - 512 * 1024);
    });
});

describe('fitWithin', () => {
    it('keeps images whose long edge is already within the limit', () => {
        expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
        expect(fitWithin(1568, 1000)).toEqual({ width: 1568, height: 1000 });
    });
    it('scales the long edge down to 1568 and keeps the aspect ratio', () => {
        expect(fitWithin(4000, 3000)).toEqual({ width: 1568, height: 1176 });
        expect(fitWithin(1000, 3136)).toEqual({ width: 500, height: 1568 });
        expect(fitWithin(10000, 1)).toEqual({ width: 1568, height: 1 });
    });
    it('returns null for sizes that are not positive finite numbers', () => {
        expect(fitWithin(0, 100)).toBeNull();
        expect(fitWithin(100, NaN)).toBeNull();
        expect(fitWithin(-5, 10)).toBeNull();
    });
});

describe('base64ByteLength', () => {
    it('counts decoded bytes, accounting for padding', () => {
        expect(base64ByteLength('')).toBe(0);
        expect(base64ByteLength('QQ==')).toBe(1);
        expect(base64ByteLength('QUI=')).toBe(2);
        expect(base64ByteLength('QUJD')).toBe(3);
        expect(base64ByteLength(b64OfBytes(PNG_MAX_BYTES))).toBe(PNG_MAX_BYTES);
    });
});

describe('parseImageDataUrl / isImageDataUrl', () => {
    it('splits allowed base64 image data URLs', () => {
        expect(parseImageDataUrl('data:image/png;base64,QUJD')).toEqual({
            mediaType: 'image/png',
            data: 'QUJD',
            dataUrl: 'data:image/png;base64,QUJD',
        });
        expect(isImageDataUrl('data:image/webp;base64,QUJD')).toBe(true);
    });
    it('rejects other media types and non-data URLs', () => {
        for (const url of ['data:image/svg+xml;base64,QUJD', 'data:text/html;base64,QUJD', 'data:image/png,raw', 'https://x/y.png', 'javascript:alert(1)']) {
            expect(parseImageDataUrl(url)).toBeNull();
            expect(isImageDataUrl(url)).toBe(false);
        }
        expect(isImageDataUrl(undefined)).toBe(false);
    });
});

describe('pickPastedImages', () => {
    const item = (type: string, kind = 'file') => ({ kind, type, getAsFile: () => file(type) });
    const clipboard = (text: string, items: unknown[], files: unknown[] = []) => ({
        getData: (t: string) => (t === 'text/plain' ? text : ''),
        items,
        files,
    });

    it('returns the allowed image files of an image-only clipboard', () => {
        const picked = pickPastedImages(clipboard('', [item('image/png'), item('image/svg+xml'), item('text/html', 'string')]));
        expect(picked).toEqual([file('image/png')]);
    });
    it('leaves a paste that has plain text to the browser', () => {
        expect(pickPastedImages(clipboard('hello', [item('image/png')]))).toEqual([]);
        expect(pickPastedImages(clipboard('hello', [item('text/plain', 'string')]))).toEqual([]);
    });
    it('falls back to clipboardData.files and tolerates a missing clipboard', () => {
        expect(pickPastedImages(clipboard('', [], [file('image/jpeg'), file('application/pdf')]))).toEqual([file('image/jpeg')]);
        expect(pickPastedImages(null)).toEqual([]);
    });
});

describe('pickDroppedImages / hasDraggedFiles', () => {
    it('separates allowed images from other dropped files', () => {
        const dt = { files: [file('image/gif'), file('application/pdf'), file('image/webp')] };
        expect(pickDroppedImages(dt)).toEqual({ files: [file('image/gif'), file('image/webp')], rejected: 1 });
        expect(pickDroppedImages(null)).toEqual({ files: [], rejected: 0 });
    });
    it('only treats drags that carry files as attachments', () => {
        expect(hasDraggedFiles({ types: ['Files'] })).toBe(true);
        expect(hasDraggedFiles({ types: ['text/plain'] })).toBe(false);
        expect(hasDraggedFiles(null)).toBe(false);
    });
});

describe('takeImageSlots', () => {
    it('accepts at most 5 images per message', () => {
        expect(takeImageSlots(0, [1, 2, 3])).toEqual({ accepted: [1, 2, 3], dropped: 0 });
        expect(takeImageSlots(3, [1, 2, 3])).toEqual({ accepted: [1, 2], dropped: 1 });
        expect(takeImageSlots(5, [1])).toEqual({ accepted: [], dropped: 1 });
        expect(takeImageSlots(0, [1, 2, 3, 4, 5, 6, 7])).toEqual({ accepted: [1, 2, 3, 4, 5], dropped: 2 });
    });
});

describe('prepareImage', () => {
    it('keeps a PNG of at most 1 MB at its original size', async () => {
        const png = b64OfBytes(PNG_MAX_BYTES);
        const codec = fakeCodec({ width: 800, height: 600, png });
        const result = await prepareImage(file('image/png'), codec);
        expect(result).toEqual({ image: { name: 'shot.png', mediaType: 'image/png', data: png, dataUrl: dataUrl('image/png', png) } });
        expect(codec.encode).toHaveBeenCalledTimes(1);
        expect(codec.encode).toHaveBeenCalledWith(codec.source, 800, 600, 'image/png');
        expect(codec.source.close).toHaveBeenCalled();
    });

    it('downscales so the long edge is 1568 before encoding', async () => {
        const codec = fakeCodec({ width: 4000, height: 3000 });
        await prepareImage(file('image/jpeg', 'photo.jpg'), codec);
        expect(codec.encode).toHaveBeenCalledWith(codec.source, 1568, 1176, 'image/png');
    });

    it('re-encodes as JPEG quality 0.85 when the PNG is over 1 MB', async () => {
        const jpeg = b64OfBytes(400 * 1024);
        const codec = fakeCodec({ png: b64OfBytes(PNG_MAX_BYTES + 1), jpeg });
        const result = await prepareImage(file('image/webp', 'a.webp'), codec);
        expect(codec.encode).toHaveBeenLastCalledWith(codec.source, 800, 600, 'image/jpeg', 0.85);
        expect(result).toEqual({ image: { name: 'a.webp', mediaType: 'image/jpeg', data: jpeg, dataUrl: dataUrl('image/jpeg', jpeg) } });
    });

    it('rejects an image still over 3.75 MB of base64 after JPEG', async () => {
        const atLimit = 'A'.repeat(MAX_IMAGE_BASE64);
        const ok = await prepareImage(file('image/png'), fakeCodec({ png: b64OfBytes(2 * MiB), jpeg: atLimit }));
        expect(ok).toHaveProperty('image');

        const codec = fakeCodec({ png: b64OfBytes(2 * MiB), jpeg: atLimit + 'AAAA' });
        const result = await prepareImage(file('image/png', 'huge.png'), codec);
        expect(result).toEqual({ error: expect.stringContaining('huge.png') });
        expect((result as { error: string }).error).toContain('3.75 MB');
        expect(codec.source.close).toHaveBeenCalled();
    });

    it('rejects types outside the allowlist without decoding them', async () => {
        for (const type of ['image/svg+xml', 'application/pdf', '', undefined]) {
            const codec = fakeCodec();
            const result = await prepareImage({ type, name: 'x' }, codec);
            expect(result).toEqual({ error: expect.stringContaining('PNG, JPEG, GIF and WebP') });
            expect(codec.decode).not.toHaveBeenCalled();
        }
    });

    it('reports an image the browser cannot decode or encode', async () => {
        const broken = await prepareImage(file('image/png', 'bad.png'), fakeCodec({ decodeError: new Error('boom') }));
        expect(broken).toEqual({ error: expect.stringContaining('bad.png') });

        const codec = fakeCodec();
        codec.encode.mockImplementation(async () => 'data:,');
        expect(await prepareImage(file('image/png'), codec)).toHaveProperty('error');
    });
});

describe('totalSizeError', () => {
    const img = (n: number) => ({ data: 'A'.repeat(n) });
    it('allows up to 4.5 MB of base64 across the message', () => {
        expect(totalSizeError([])).toBeNull();
        expect(totalSizeError([img(MAX_TOTAL_BASE64 - 10), img(10)])).toBeNull();
    });
    it('rejects a send over 4.5 MB of base64', () => {
        const error = totalSizeError([img(3 * MiB), img(2 * MiB)]);
        expect(error).toContain('4.5 MB');
    });
});

describe('buildUserMessage', () => {
    const png = { mediaType: 'image/png', data: 'QUJD' };
    const jpeg = { mediaType: 'image/jpeg', data: 'REVG' };

    it('returns the plain string when there are no images', () => {
        expect(buildUserMessage('hello', [])).toBe('hello');
        expect(buildUserMessage('hello', undefined)).toBe('hello');
    });
    it('puts the image blocks first and the text last', () => {
        expect(buildUserMessage('what is this?', [png, jpeg])).toEqual({
            role: 'user',
            content: [
                { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'QUJD' } },
                { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'REVG' } },
                { type: 'text', text: 'what is this?' },
            ],
        });
    });
    it('omits the text block when the text is empty or blank', () => {
        for (const text of ['', '   \n']) {
            expect(buildUserMessage(text, [png])).toEqual({
                role: 'user',
                content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'QUJD' } }],
            });
        }
    });
});

describe('imageBlockToDataUrl / splitImageContent', () => {
    const block = (media_type: string, data: string, type = 'base64') => ({ type: 'image', source: { type, media_type, data } });

    it('builds data URLs only for allowed base64 image blocks', () => {
        expect(imageBlockToDataUrl(block('image/gif', 'R0lG+/8='))).toBe('data:image/gif;base64,R0lG+/8=');
        expect(imageBlockToDataUrl(block('image/svg+xml', 'QUJD'))).toBeNull();
        expect(imageBlockToDataUrl(block('image/png', 'QUJD", onerror="x'))).toBeNull();
        expect(imageBlockToDataUrl(block('image/png', 'https://x/y.png', 'url'))).toBeNull();
        expect(imageBlockToDataUrl({ type: 'text', text: 'hi' })).toBeNull();
        expect(imageBlockToDataUrl(null)).toBeNull();
    });

    it('returns string content as text with no images', () => {
        expect(splitImageContent('plain')).toEqual({ text: 'plain', images: [] });
    });

    it('separates the text and image blocks of an array', () => {
        const content = [
            block('image/png', 'QUJD'),
            block('image/svg+xml', 'QUJD'),
            { type: 'text', text: 'first' },
            { type: 'tool_result', content: 'ignored' },
            'second',
        ];
        expect(splitImageContent(content)).toEqual({ text: 'first\n\nsecond', images: ['data:image/png;base64,QUJD'] });
        expect(splitImageContent(buildUserMessage('', [{ mediaType: 'image/png', data: 'QUJD' }]).content)).toEqual({
            text: '',
            images: ['data:image/png;base64,QUJD'],
        });
    });
});
