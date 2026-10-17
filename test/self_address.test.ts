import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseListenAddress, selfBaseUrlFor, selfBaseUrl } from '../src/util/self';
import AbstractProvider from '../src/providers/abstract_provider';

function filesUnderSrcContaining(needle: string): string[] {
    const hits: string[] = [];
    const walk = (dir: string) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(p);
            else if (entry.name.endsWith('.ts') && fs.readFileSync(p, 'utf8').includes(needle)) hits.push(p);
        }
    };
    walk(path.resolve(__dirname, '../src'));
    return hits;
}

describe('parseListenAddress', () => {
    it('falls back to the server default when the platform sets nothing', () => {
        expect(parseListenAddress(undefined)).toEqual({ host: '0.0.0.0', port: 8866 });
    });
    it.each([
        ['0.0.0.0:3000', { host: '0.0.0.0', port: 3000 }],
        ['127.0.0.1:8080', { host: '127.0.0.1', port: 8080 }],
        ['[::]:3000', { host: '::', port: 3000 }],
        ['[::1]:65535', { host: '::1', port: 65535 }],
    ])('parses %s', (input, expected) => {
        expect(parseListenAddress(input as string)).toEqual(expected);
    });
    it('trims surrounding whitespace', () => {
        expect(parseListenAddress(' 0.0.0.0:8866 ')).toEqual({ host: '0.0.0.0', port: 8866 });
    });
    it.each(['', 'abc', 'host:', ':3000', 'host:notaport', 'host:0', 'host:70000', 'http://0.0.0.0:8866', 'a b:80'])(
        'rejects %s', (input) => {
            expect(() => parseListenAddress(input)).toThrow('AWS_LAMBDA_HTTP_ENDPOINT');
        });
});

describe('selfBaseUrlFor', () => {
    it('maps a wildcard host to loopback', () => {
        expect(selfBaseUrlFor('0.0.0.0', 8866)).toBe('http://127.0.0.1:8866');
        expect(selfBaseUrlFor('::', 8866)).toBe('http://[::1]:8866');
    });
    it.each([
        ['127.0.0.1', 3000, 'http://127.0.0.1:3000'],
        ['10.0.0.5', 8080, 'http://10.0.0.5:8080'],
        ['fd00::1', 3000, 'http://[fd00::1]:3000'],
    ])('builds %s:%i', (host, port, expected) => {
        expect(selfBaseUrlFor(host as string, port as number)).toBe(expected);
    });
});

it('no source file still points a self-callback at a fixed port', () => {
    expect(filesUnderSrcContaining(':8866')).toEqual([]);
});

describe('self-callback target', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('a self-callback goes to the address the server bound', async () => {
        class TestProvider extends AbstractProvider {
            chat() { }
        }
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, body: null, text: async () => '', json: async () => ({}) });
        vi.stubGlobal('fetch', fetchMock);
        await new TestProvider().localCompleteSync({ user: { api_key: 'k' } }, { prompt: 'hi' }, 'sess');
        expect(fetchMock.mock.calls[0][0]).toBe(`${selfBaseUrl}/v1/completions`);
    });
});

describe('module-level exports follow the environment', () => {
    afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
    const load = async () => { vi.resetModules(); return await import('../src/util/self'); };

    it('leaves the host unset by default so the socket stays dual-stack', async () => {
        vi.stubEnv('AWS_LAMBDA_HTTP_ENDPOINT', undefined as any);
        delete process.env.AWS_LAMBDA_HTTP_ENDPOINT;
        const m = await load();
        expect(m.listenHost).toBeUndefined();
        expect(m.listenPort).toBe(8866);
        expect(m.selfBaseUrl).toBe('http://127.0.0.1:8866');
    });
    it('uses the platform address when set', async () => {
        vi.stubEnv('AWS_LAMBDA_HTTP_ENDPOINT', '0.0.0.0:3000');
        const m = await load();
        expect(m.listenHost).toBe('0.0.0.0');
        expect(m.listenPort).toBe(3000);
        expect(m.selfBaseUrl).toBe('http://127.0.0.1:3000');
    });
    it('fails the import on a bad value', async () => {
        vi.stubEnv('AWS_LAMBDA_HTTP_ENDPOINT', 'nope');
        await expect(load()).rejects.toThrow('AWS_LAMBDA_HTTP_ENDPOINT');
    });
});
