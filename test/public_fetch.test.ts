import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import sharp from 'sharp';
import { S3Client } from '@aws-sdk/client-s3';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { isPublicAddress, fetchPublicImage, PUBLIC_FETCH_LIMITS } from '../src/util/public_fetch';
import BedrockConverse from '../src/providers/bedrock_converse';
import ChatMessageConverter from '../src/providers/chat_message';
import NovaCanvas from '../src/providers/nova_canvas';
import providers from '../src/providers/provider';
import { errorHandler } from '../src/middleware/handlers';
import { HERMETIC_ENV } from './helpers/hermetic_env';

// The real fetchPublicImage runs unless a test replaces one call, so the converters can be checked on a public URL.
vi.mock('../src/util/public_fetch', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../src/util/public_fetch')>();
    return { ...actual, fetchPublicImage: vi.fn(actual.fetchPublicImage) };
});

const NOT_ALLOWED = 'Image URL is not allowed: use an http(s) URL on a public address, or a data: URL.';
const OUTSIDE_BUCKET = "s3:// image URLs must point to the model's s3Bucket.";

type Route = (req: http.IncomingMessage, res: http.ServerResponse) => void;

// A server on 127.0.0.1 that counts the requests it receives. Tests that reach it allow 127.0.0.1 explicitly.
const server = { requests: 0, port: 0, routes: new Map<string, Route>() };
let httpServer: http.Server;
let png: Buffer;

const at = (path: string) => `http://127.0.0.1:${server.port}${path}`;
const onlyLoopback = (ip: string) => ip === '127.0.0.1';
const resolver = (names: Record<string, string[]>) => vi.fn(async (host: string) => {
    if (!(host in names)) throw new Error(`no such name: ${host}`);
    return names[host];
});
const image = (type = 'image/png', body: Buffer = png): Route => (_req, res) => {
    res.writeHead(200, { 'content-type': type, 'content-length': body.length });
    res.end(body);
};
const redirect = (location: string): Route => (_req, res) => {
    res.writeHead(302, { location });
    res.end();
};

const rejection = async (run: () => Promise<unknown>): Promise<any> => {
    try {
        await run();
    } catch (ex) {
        return ex;
    }
    throw new Error('expected a rejection');
};

beforeAll(async () => {
    png = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#c00' } }).png().toBuffer();
    httpServer = http.createServer((req, res) => {
        server.requests++;
        const route = server.routes.get(req.url ?? '');
        if (route) {
            route(req, res);
        } else {
            res.writeHead(404, { 'content-type': 'image/png' });
            res.end(png);
        }
    });
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', () => resolve()));
    server.port = (httpServer.address() as AddressInfo).port;
});

afterAll(async () => {
    httpServer.closeAllConnections();
    await new Promise((resolve) => httpServer.close(resolve));
});

let s3Send: ReturnType<typeof vi.spyOn>;
let bedrockSend: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    server.requests = 0;
    server.routes.clear();
    vi.mocked(fetchPublicImage).mockClear();
    for (const [name, value] of Object.entries(HERMETIC_ENV)) vi.stubEnv(name, value);
    // Nothing here may reach the network: the global fetch, S3 and Bedrock all fail loudly.
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('unexpected use of the global fetch'); }));
    s3Send = vi.spyOn(S3Client.prototype, 'send').mockRejectedValue(new Error('unexpected S3 call') as never);
    bedrockSend = vi.spyOn(BedrockRuntimeClient.prototype, 'send').mockRejectedValue(new Error('unexpected Bedrock call') as never);
});

afterEach(() => {
    vi.unstubAllGlobals();
    s3Send.mockRestore();
    bedrockSend.mockRestore();
});

describe('isPublicAddress', () => {
    it.each(['10.0.0.1', '172.16.0.1', '192.168.1.1', '127.0.0.1', '169.254.169.254', '100.64.0.1', '0.0.0.0',
        '::1', 'fe80::1', 'fc00::1', 'fd00:ec2::254', '::ffff:10.0.0.1', '::ffff:127.0.0.1', '224.0.0.1',
        '172.31.255.255', '100.127.255.255', '192.0.0.8', '192.0.2.1', '198.18.0.1', '198.19.255.255', '198.51.100.7',
        '203.0.113.9', '240.0.0.1', '255.255.255.255', '::', 'ff02::1', '2001:db8::1', '::ffff:7f00:1',
        '::ffff:169.254.169.254', '::ffff:192.168.0.1', 'fe80::1%eth0', 'localhost', ''])
        ('%s is not public', (ip) => expect(isPublicAddress(ip)).toBe(false));
    it.each(['8.8.8.8', '2606:4700::1111', '1.1.1.1', '172.32.0.1', '100.128.0.1', '192.0.1.1', '198.20.0.1', '::ffff:8.8.8.8'])
        ('%s is public', (ip) => expect(isPublicAddress(ip)).toBe(true));
});

describe('fetchPublicImage', () => {
    it('uses the limits it documents', () => {
        expect(PUBLIC_FETCH_LIMITS).toEqual({ maxBytes: 10 * 1024 * 1024, timeoutMs: 15000, maxRedirects: 3 });
    });

    it('rejects a literal loopback URL without connecting', async () => {
        server.routes.set('/img.png', image());
        const port = server.port;
        for (const url of [at('/img.png'), `http://2130706433:${port}/img.png`, `http://0x7f.0.0.1:${port}/img.png`,
            `http://[::ffff:127.0.0.1]:${port}/img.png`, `http://[::1]:${port}/img.png`]) {
            const ex = await rejection(() => fetchPublicImage(url));
            expect(ex.message).toBe(NOT_ALLOWED);
            expect(ex.reason).toBe('address');
        }
        expect(server.requests).toBe(0);
    });

    it('rejects localhost at connect time with the system resolver', async () => {
        server.routes.set('/img.png', image());
        const ex = await rejection(() => fetchPublicImage(`http://localhost:${server.port}/img.png`));
        expect(ex.message).toBe(NOT_ALLOWED);
        expect(ex.reason).toBe('address');
        expect(server.requests).toBe(0);
    });

    it('rejects a name that resolves to a private address', async () => {
        const resolve = resolver({ 'img.test': ['10.0.0.5'] });
        const ex = await rejection(() => fetchPublicImage(`http://img.test:${server.port}/img.png`, { resolve }));
        expect(ex.message).toBe(NOT_ALLOWED);
        expect(ex.reason).toBe('address');
        expect(resolve).toHaveBeenCalledWith('img.test');
    });

    it('rejects a name that does not resolve with the same message', async () => {
        const ex = await rejection(() => fetchPublicImage('http://nowhere.test/img.png', { resolve: resolver({}) }));
        expect(ex.message).toBe(NOT_ALLOWED);
    });

    it('rejects a redirect to a private address after one request', async () => {
        server.routes.set('/start', redirect('http://internal.test/'));
        const resolve = resolver({ 'internal.test': ['10.0.0.9'] });
        const ex = await rejection(() => fetchPublicImage(at('/start'), { resolve, isAllowedAddress: onlyLoopback }));
        expect(ex.message).toBe(NOT_ALLOWED);
        expect(ex.reason).toBe('address');
        expect(resolve).toHaveBeenCalledWith('internal.test');
        expect(server.requests).toBe(1);
    });

    it.each(['http://169.254.169.254/latest/meta-data/', 'file:///etc/passwd', 'ftp://127.0.0.1/x.png'])
        ('rejects a redirect to %s after one request', async (location) => {
            server.routes.set('/start', redirect(location));
            const ex = await rejection(() => fetchPublicImage(at('/start'), { isAllowedAddress: onlyLoopback }));
            expect(ex.message).toBe(NOT_ALLOWED);
            expect(server.requests).toBe(1);
        });

    it('follows three redirects, relative ones included, and checks every hop', async () => {
        server.routes.set('/r1', redirect(at('/r2')));
        server.routes.set('/r2', redirect('http://img.test:' + server.port + '/r3'));
        server.routes.set('/r3', redirect('/img.png'));
        server.routes.set('/img.png', image());
        const resolve = resolver({ 'img.test': ['127.0.0.1'] });
        const result = await fetchPublicImage(at('/r1'), { resolve, isAllowedAddress: onlyLoopback });
        expect(result.bytes.equals(png)).toBe(true);
        expect(server.requests).toBe(4);
        expect(resolve).toHaveBeenCalledWith('img.test');
    });

    it('rejects a private address on a later hop', async () => {
        server.routes.set('/r1', redirect('/r2'));
        server.routes.set('/r2', redirect('http://[fd00:ec2::254]/latest/'));
        const ex = await rejection(() => fetchPublicImage(at('/r1'), { isAllowedAddress: (ip) => ip === '127.0.0.1' || isPublicAddress(ip) }));
        expect(ex.reason).toBe('address');
        expect(server.requests).toBe(2);
    });

    it('rejects a fourth redirect without following it', async () => {
        for (let i = 1; i <= 4; i++) server.routes.set(`/r${i}`, redirect(`/r${i + 1}`));
        server.routes.set('/r5', image());
        const ex = await rejection(() => fetchPublicImage(at('/r1'), { isAllowedAddress: onlyLoopback }));
        expect(ex.message).toBe(NOT_ALLOWED);
        expect(ex.reason).toBe('redirects');
        expect(server.requests).toBe(4);
    });

    it('fetches an allowed image', async () => {
        server.routes.set('/img.png', image('IMAGE/PNG; charset=binary'));
        const literal = await fetchPublicImage(at('/img.png'), { isAllowedAddress: onlyLoopback });
        expect(literal.bytes.equals(png)).toBe(true);
        expect(literal.contentType).toBe('image/png');

        const resolve = resolver({ 'img.test': ['10.0.0.5', '127.0.0.1'] });
        const named = await fetchPublicImage(`http://img.test:${server.port}/img.png`, { resolve, isAllowedAddress: onlyLoopback });
        expect(named.bytes.equals(png)).toBe(true);
        expect(named.contentType).toBe('image/png');
        expect(server.requests).toBe(2);
    });

    it('rejects a non-image content type and a body over maxBytes', async () => {
        server.routes.set('/page', image('text/html', Buffer.from('<html></html>')));
        server.routes.set('/none', (_req, res) => { res.writeHead(200); res.end(png); });
        server.routes.set('/big', image('image/png', Buffer.alloc(2048)));
        server.routes.set('/chunked', (_req, res) => {
            res.writeHead(200, { 'content-type': 'image/png' });
            res.write(Buffer.alloc(1024));
            res.end(Buffer.alloc(1025));
        });
        server.routes.set('/exact', image('image/png', Buffer.alloc(2048, 1)));
        const opts = { isAllowedAddress: onlyLoopback, maxBytes: 2048 };

        for (const [path, reason] of [['/page', 'content-type'], ['/none', 'content-type']]) {
            const ex = await rejection(() => fetchPublicImage(at(path), opts));
            expect(ex.message).toBe(NOT_ALLOWED);
            expect(ex.reason).toBe(reason);
        }
        const big = await rejection(() => fetchPublicImage(at('/big'), { ...opts, maxBytes: 2047 }));
        expect(big.reason).toBe('size');
        const chunked = await rejection(() => fetchPublicImage(at('/chunked'), opts));
        expect(chunked.message).toBe(NOT_ALLOWED);
        expect(chunked.reason).toBe('size');
        expect((await fetchPublicImage(at('/exact'), opts)).bytes.length).toBe(2048);
    });

    it('rejects an error status', async () => {
        const ex = await rejection(() => fetchPublicImage(at('/missing.png'), { isAllowedAddress: onlyLoopback }));
        expect(ex.message).toBe(NOT_ALLOWED);
        expect(ex.reason).toBe('status');
        expect(server.requests).toBe(1);
    });

    it('gives up after timeoutMs, while waiting for headers or for the body', async () => {
        server.routes.set('/hang', () => { /* never answers */ });
        server.routes.set('/slow-body', (_req, res) => {
            res.writeHead(200, { 'content-type': 'image/png' });
            res.write(Buffer.alloc(10));
        });
        for (const path of ['/hang', '/slow-body']) {
            const started = Date.now();
            const ex = await rejection(() => fetchPublicImage(at(path), { isAllowedAddress: onlyLoopback, timeoutMs: 200 }));
            expect(ex.message).toBe(NOT_ALLOWED);
            expect(ex.reason).toBe('timeout');
            expect(Date.now() - started).toBeLessThan(2000);
        }
    });

    it('rejects file:, ftp: and gopher: URLs', async () => {
        for (const url of ['file:///etc/passwd', 'ftp://127.0.0.1/x.png', 'gopher://127.0.0.1:70/_x', 'data:image/png;base64,AA==', 'not a url']) {
            const ex = await rejection(() => fetchPublicImage(url, { isAllowedAddress: () => true }));
            expect(ex.message).toBe(NOT_ALLOWED);
            expect(ex.reason).toBe('scheme');
        }
        expect(server.requests).toBe(0);
    });

    it('answers 400, typed invalid_request_error for /v1/messages', async () => {
        const ex = await rejection(() => fetchPublicImage('http://10.0.0.1/x.png'));
        expect(ex.statusCode).toBe(400);
        expect(ex.anthropicType).toBe('invalid_request_error');
        // The underlying reason stays out of the client response.
        expect(ex.cause).toBeUndefined();
    });
});

const handled = async (path: string, error: any) => {
    const ctx: any = { path, res: { on() {} }, logger: { error() {} }, set(h: any) { this.h = h; } };
    await errorHandler(ctx, async () => { throw error; });
    return ctx;
};

describe('image URLs in the converse provider', () => {
    const converter = () => (new BedrockConverse() as any).chatMessageConverter;
    const withImage = (url: string) => ({
        model: 'm',
        messages: [{ role: 'user', content: [{ type: 'text', text: 'what is this' }, { type: 'image_url', image_url: { url } }] }],
    });

    it('converse turns a rejected URL into a 400 and keeps data: URLs working', async () => {
        server.routes.set('/img.png', image());
        const ex = await rejection(() => converter().toPayload(withImage(at('/img.png')), { modelId: 'amazon.nova-pro-v1:0' }));
        expect(ex.message).toBe(NOT_ALLOWED);
        expect(server.requests).toBe(0);

        const legacy = await handled('/v1/chat/completions', ex);
        expect(legacy.status).toBe(400);
        expect(legacy.body).toMatchObject({ success: false });
        expect(JSON.stringify(legacy.body)).toContain(NOT_ALLOWED);

        const data = `data:image/png;base64,${png.toString('base64')}`;
        const payload = await converter().toPayload(withImage(data), { modelId: 'amazon.nova-pro-v1:0' });
        const block = payload.messages[0].content.find((c: any) => c.image);
        expect(Buffer.from(block.image.source.bytes).equals(png)).toBe(true);
        // Only the http URL above went to the fetcher.
        expect(fetchPublicImage).toHaveBeenCalledTimes(1);
    });

    it('answers an Anthropic image URL on /v1/messages with invalid_request_error', async () => {
        const chatRequest = providers.convertAnthropicRequest({
            model: 'm',
            max_tokens: 10,
            messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'url', url: 'http://169.254.169.254/latest/meta-data/' } }] }],
        });
        const ex = await rejection(() => converter().toPayload(chatRequest, { modelId: 'amazon.nova-pro-v1:0' }));
        const ctx = await handled('/v1/messages', ex);
        expect(ctx.status).toBe(400);
        expect(ctx.body).toEqual({ type: 'error', error: { type: 'invalid_request_error', message: NOT_ALLOWED } });
    });

    it('uses the fetched bytes and content type of a public image', async () => {
        vi.mocked(fetchPublicImage).mockResolvedValueOnce({ bytes: png, contentType: 'image/webp' });
        const image = await converter().parseImageUrl('https://images.example/cat.webp');
        expect(fetchPublicImage).toHaveBeenCalledWith('https://images.example/cat.webp');
        expect(image).toEqual({ format: 'webp', source: { bytes: png } });
    });

    it('rejects other schemes instead of sending an empty image', async () => {
        const ex = await rejection(() => converter().parseImageUrl('file:///etc/passwd'));
        expect(ex.message).toBe(NOT_ALLOWED);
    });
});

describe('image URLs in the shared message converter', () => {
    it('rejects a private URL, fetches a public one and keeps data: URLs', async () => {
        server.routes.set('/img.png', image());
        const converter = new ChatMessageConverter();
        const ex = await rejection(() => converter.convertContent([{ type: 'image_url', image_url: { url: at('/img.png') } }]));
        expect(ex.message).toBe(NOT_ALLOWED);
        expect(ex.statusCode).toBe(400);
        expect(server.requests).toBe(0);

        vi.mocked(fetchPublicImage).mockResolvedValueOnce({ bytes: png, contentType: 'image/png' });
        expect(await converter.parseImageUrl('https://images.example/cat.png'))
            .toEqual({ type: 'base64', media_type: 'image/png', data: png.toString('base64') });

        expect(await converter.parseImageUrl('data:image/png;base64,AAAA')).toEqual({ type: 'base64', media_type: 'image/png', data: 'AAAA' });
    });
});

describe('image URLs in nova-canvas', () => {
    const bedrockAnswer = { send: vi.fn(async () => ({ body: new TextEncoder().encode(JSON.stringify({ images: ['out'] })) })) };
    const nova = (s3Send: any) => {
        const provider: any = new NovaCanvas();
        provider.s3Bucket = 'model-bucket';
        provider.paintModelId = 'amazon.nova-canvas-v1:0';
        provider.client = bedrockAnswer;
        provider.s3Client = { send: s3Send };
        return provider;
    };

    it('nova-canvas rejects an s3:// URL outside its bucket', async () => {
        const s3Send = vi.fn(async () => ({ Body: { transformToByteArray: async () => new Uint8Array(png) } }));
        const provider = nova(s3Send);
        for (const url of ['s3://other-bucket/a.png', 's3://model-bucket-2/a.png', 's3://model-bucket.example/a.png', 's3:///a.png']) {
            const ex = await rejection(() => provider.colorize({ image_url: url, prompt: 'p' }));
            expect(ex.message).toBe(OUTSIDE_BUCKET);
            expect(ex.statusCode).toBe(400);
        }
        await expect(provider.variate({ image_urls: ['s3://model-bucket/a.png', 's3://other-bucket/b.png'], prompt: 'p' })).rejects.toThrow(OUTSIDE_BUCKET);
        expect(s3Send).toHaveBeenCalledTimes(1);

        s3Send.mockClear();
        expect(await provider.colorize({ image_url: 's3://model-bucket/dir/a.png', prompt: 'p' })).toEqual(['out']);
        expect(s3Send).toHaveBeenCalledTimes(1);
        expect((s3Send.mock.calls[0] as any[])[0].input).toEqual({ Bucket: 'model-bucket', Key: 'dir/a.png' });
    });

    it('fetches http(s) image URLs only from public addresses', async () => {
        server.routes.set('/img.png', image());
        const provider = nova(vi.fn());
        const ex = await rejection(() => provider.rembg({ image_url: at('/img.png') }));
        expect(ex.message).toBe(NOT_ALLOWED);
        expect(server.requests).toBe(0);

        vi.mocked(fetchPublicImage).mockResolvedValueOnce({ bytes: png, contentType: 'image/png' });
        expect(await provider.rembg({ image_url: 'https://images.example/cat.png' })).toEqual(['out']);
    });

    it('answers a rejected image with its own message', async () => {
        const provider: any = new NovaCanvas();
        provider.setModelData({ config: { paintModelId: 'amazon.nova-canvas-v1:0', localLlmModel: 'llm', s3Bucket: 'model-bucket', s3Region: 'us-east-1' } });
        provider.toPaintPrompt = async () => ({
            choices: [{ message: { content: 'ok', tool_calls: [{ function: { name: 'colorize', arguments: JSON.stringify({ image_url: 's3://other-bucket/a.png' }) } }] } }],
        });
        const ctx: any = { status: 0, headers: {}, set() {}, res: { write() {} } };
        const ex = await rejection(() => provider.chat({ model: 'paint', messages: [] }, 's', ctx));
        expect(ex.message).toBe(OUTSIDE_BUCKET);
        expect(s3Send).not.toHaveBeenCalled();
        expect((await handled('/v1/chat/completions', ex)).status).toBe(400);
    });
});
