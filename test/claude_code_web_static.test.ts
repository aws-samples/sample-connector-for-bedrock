import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import Koa from 'koa';
import fs from 'fs';
import os from 'os';
import http from 'http';
import path from 'path';
import type { AddressInfo } from 'net';
import { ccStaticHandler } from '../src/middleware/claude_code_web_static';

let tmp: string;
let staticDir: string;

beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-static-'));
    staticDir = path.join(tmp, 'cc');
    fs.mkdirSync(path.join(staticDir, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(staticDir, 'index.html'), '<html>INDEX</html>');
    fs.writeFileSync(path.join(staticDir, 'assets', 'a.js'), 'console.log(1)');
    fs.writeFileSync(path.join(tmp, 'secret.txt'), 'SECRET');
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

async function withServer(enabled: boolean, fn: (get: (p: string) => Promise<Response>, isEnabled: any, port: number) => Promise<void>) {
    const isEnabled = vi.fn(async () => enabled);
    const app = new Koa();
    app.use(ccStaticHandler({ staticDir, isEnabled }));
    app.use(async (ctx) => {
        ctx.status = 200;
        ctx.body = 'NEXT';
    });
    const server = app.listen(0);
    const port = (server.address() as AddressInfo).port;
    // note: fetch normalises ../ and %2e%2e client-side; raw traversal is tested via http.request below
    const get = (p: string) => fetch(`http://127.0.0.1:${port}${p}`, { redirect: 'manual' });
    try {
        await fn(get, isEnabled, port);
    } finally {
        server.close();
    }
}

describe('ccStaticHandler', () => {
    it('404 when not enabled', () =>
        withServer(false, async (get) => {
            expect((await get('/cc/')).status).toBe(404);
            expect((await get('/cc')).status).toBe(404);
        }));

    it('/cc redirects to /cc/', () =>
        withServer(true, async (get) => {
            const r = await get('/cc');
            expect(r.status).toBe(302);
            expect(new URL(r.headers.get('location')!, 'http://x').pathname).toBe('/cc/');
        }));

    it('/cc/ serves index with no-cache', () =>
        withServer(true, async (get) => {
            const r = await get('/cc/');
            expect(await r.text()).toContain('INDEX');
            expect(r.headers.get('cache-control')).toBe('no-cache');
        }));

    it('assets are immutable', () =>
        withServer(true, async (get) => {
            const r = await get('/cc/assets/a.js');
            expect(await r.text()).toBe('console.log(1)');
            expect(r.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
        }));

    it('sends a Content-Security-Policy with every page and asset', () =>
        withServer(true, async (get) => {
            const csp = "script-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'";
            for (const p of ['/cc/', '/cc/index.html', '/cc/projects/x', '/cc/assets/a.js']) {
                const r = await get(p);
                expect(r.status, p).toBe(200);
                expect(r.headers.get('content-security-policy'), p).toBe(csp);
            }
        }));

    it('extensionless path falls back to index', () =>
        withServer(true, async (get) => {
            expect(await (await get('/cc/projects/x')).text()).toContain('INDEX');
        }));

    it('missing file with extension goes to next', () =>
        withServer(true, async (get) => {
            expect(await (await get('/cc/missing.js')).text()).toBe('NEXT');
        }));

    it('/cc/api passes to next without calling isEnabled', () =>
        withServer(true, async (get, isEnabled) => {
            expect(await (await get('/cc/api/invocations')).text()).toBe('NEXT');
            expect(await (await get('/cc/api')).text()).toBe('NEXT');
            expect(isEnabled).not.toHaveBeenCalled();
        }));

    it('non-GET and other prefixes go to next', () =>
        withServer(true, async (get) => {
            expect(await (await get('/ccx/foo')).text()).toBe('NEXT');
            expect(await (await get('/other')).text()).toBe('NEXT');
        }));

    it('cannot escape staticDir (raw request paths, not normalised by the client)', () =>
        withServer(true, async (_get, _isEnabled, port) => {
            // http.request sends `path` literally, so the server really sees the traversal.
            const raw = (p: string) =>
                new Promise<{ status: number; body: string }>((resolve, reject) => {
                    const req = http.request({ host: '127.0.0.1', port, path: p, method: 'GET' }, (res) => {
                        let body = '';
                        res.on('data', (c) => (body += c));
                        res.on('end', () => resolve({ status: res.statusCode!, body }));
                    });
                    req.on('error', reject);
                    req.end();
                });
            for (const p of ['/cc/../secret.txt', '/cc/a/../../secret.txt', '/cc//etc/hosts']) {
                const r = await raw(p);
                expect(r.status, p).toBe(404);
                expect(r.body, p).not.toContain('SECRET');
                expect(r.body, p).not.toContain('localhost');
            }
        }));
});
