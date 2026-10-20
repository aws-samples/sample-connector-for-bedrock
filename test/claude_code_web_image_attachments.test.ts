import { describe, expect, it, vi } from 'vitest';
import { CC_API_BODY_LIMIT } from '../src/middleware/claude_code_web_body';
import {
    ALLOWED_IMAGE_TYPES,
    JPEG_QUALITY,
    MAX_IMAGE_BASE64,
    MAX_IMAGE_EDGE,
    MAX_IMAGES_PER_MESSAGE,
    MAX_SESSION_BASE64,
    MAX_TOTAL_BASE64,
    PNG_MAX_BYTES,
    SESSION_BUDGET_ERROR,
    base64ByteLength,
    buildUserMessage,
    fitWithin,
    hasDraggedFiles,
    imageBlockToDataUrl,
    isImageDataUrl,
    parseImageDataUrl,
    pickDroppedImages,
    pickPastedImages,
    fitSessionBudget,
    imagesBase64,
    prepareImage,
    preventFileDropNavigation,
    sessionBudgetError,
    sessionImageBase64,
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
        expect(MAX_SESSION_BASE64).toBe(4.5 * MiB);
        expect(SESSION_BUDGET_ERROR).toBe('Image budget for this session is used up (4.5 MB). Start a new session to send more images.');
        // The whole send stays well under the BFF's /cc/api body cap.
        expect(MAX_TOTAL_BASE64).toBeLessThan(CC_API_BODY_LIMIT - 512 * 1024);
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
    it('leaves a plain-text paste with no image file to the browser', () => {
        expect(pickPastedImages(clipboard('hello', [item('text/plain', 'string')]))).toEqual([]);
        expect(pickPastedImages(clipboard('hello', [item('text/plain', 'string')], [file('application/pdf', 'a.pdf')]))).toEqual([]);
    });
    it('attaches an image file even when the clipboard also has its filename as text', () => {
        // A file copied in Finder: clipboardData.files has the image, text/plain has its name
        const copied = file('image/png', 'diagram.png');
        expect(pickPastedImages(clipboard('diagram.png', [item('text/plain', 'string'), item('image/png')], [copied]))).toEqual([copied]);
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

describe('preventFileDropNavigation', () => {
    function drag(type: string, types: string[]) {
        const e = new Event(type, { cancelable: true });
        Object.assign(e, { dataTransfer: { types, dropEffect: 'none' } });
        return e as Event & { dataTransfer: { types: string[]; dropEffect: string } };
    }

    it('cancels dragover and drop of files anywhere on the page, so the browser does not open the file', () => {
        const page = new EventTarget();
        preventFileDropNavigation(page);
        for (const type of ['dragover', 'drop']) {
            const e = drag(type, ['Files']);
            page.dispatchEvent(e);
            expect(e.defaultPrevented).toBe(true);
        }
    });

    it('leaves text drags to the browser', () => {
        const page = new EventTarget();
        preventFileDropNavigation(page);
        for (const type of ['dragover', 'drop']) {
            const e = drag(type, ['text/plain']);
            page.dispatchEvent(e);
            expect(e.defaultPrevented).toBe(false);
        }
    });

    it('keeps other handlers and their drop effect working', () => {
        const page = new EventTarget();
        const seen: string[] = [];
        preventFileDropNavigation(page);
        page.addEventListener('drop', () => seen.push('other'));
        const e = drag('drop', ['Files']);
        page.dispatchEvent(e);
        expect(seen).toEqual(['other']);
        expect(e.dataTransfer.dropEffect).toBe('none');
    });

    it('returns a cleanup that removes both listeners', () => {
        const page = new EventTarget();
        preventFileDropNavigation(page)();
        for (const type of ['dragover', 'drop']) {
            const e = drag(type, ['Files']);
            page.dispatchEvent(e);
            expect(e.defaultPrevented).toBe(false);
        }
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
    it('counts the UTF-8 bytes of the text against the total', () => {
        // '€' is 3 bytes in UTF-8
        expect(totalSizeError([img(MAX_TOTAL_BASE64 - 3)], '€')).toBeNull();
        expect(totalSizeError([img(MAX_TOTAL_BASE64 - 3)], '€€')).toContain('4.5 MB');
        expect(totalSizeError([img(MAX_TOTAL_BASE64 - 3)], 'abcd')).toContain('4.5 MB');
    });
    it('leaves a text-only message alone', () => {
        expect(totalSizeError([], 'x'.repeat(MAX_TOTAL_BASE64 + 1))).toBeNull();
    });
});

describe('session image budget', () => {
    const url = (n: number) => dataUrl('image/png', 'A'.repeat(n));
    const img = (n: number) => ({ data: 'A'.repeat(n) });
    const messages = [
        { type: 'text', role: 'user', content: 'a', images: [url(1000), url(500)] },
        { type: 'text', role: 'assistant', content: 'b' },
        { type: 'system', content: 'c' },
        { type: 'text', role: 'user', content: 'd', images: [url(250)] },
    ];

    it('sums the base64 of every image already in the session', () => {
        expect(sessionImageBase64([])).toBe(0);
        expect(sessionImageBase64(messages)).toBe(1750);
        expect(sessionImageBase64([{ images: ['https://x/y.png'] }, { images: null }])).toBe(0);
        expect(imagesBase64([img(3), img(4)])).toBe(7);
    });

    it('accepts new images while the session stays within 4.5 MB and refuses the rest', () => {
        const a = img(1 * MiB), b = img(2 * MiB), c = img(0.5 * MiB);
        expect(fitSessionBudget(1 * MiB, [a, b, c])).toEqual({ accepted: [a, b, c], refused: [] });
        expect(fitSessionBudget(2 * MiB, [a, b, c])).toEqual({ accepted: [a, c], refused: [b] });
        expect(fitSessionBudget(MAX_SESSION_BASE64, [img(1)])).toEqual({ accepted: [], refused: [img(1)] });
    });

    it('blocks a send whose images would take the session over 4.5 MB', () => {
        const used = [{ images: [url(3 * MiB)] }];
        expect(sessionBudgetError(used, [img(1.5 * MiB)])).toBeNull();
        expect(sessionBudgetError(used, [img(1.5 * MiB + 1)])).toBe(SESSION_BUDGET_ERROR);
    });

    it('never blocks a send without images', () => {
        expect(sessionBudgetError([{ images: [url(MAX_SESSION_BASE64 + 1)] }], [])).toBeNull();
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
