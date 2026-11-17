import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Koa from 'koa';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { AddressInfo } from 'net';
import { brclientStaticHandler } from '../src/middleware/brclient_static';

const IMMUTABLE = 'public, max-age=31536000, immutable';

const FILES: Record<string, string> = {
    'index.html': '<html>BRCLIENT</html>',
    '404.html': '<html>NOT FOUND</html>',
    'index.txt': 'rsc payload',
    'prompts.json': '{}',
    'favicon.ico': 'ico',
    'serviceWorker.js': 'self.addEventListener("fetch", () => {})',
    'serviceWorkerRegister.js': 'navigator.serviceWorker.register("/brclient/serviceWorker.js")',
    'site.webmanifest': '{}',
    '_next/static/chunks/main-3f2a9c1b7d4e5f60.js': 'console.log("main")',
    '_next/static/Xk9bQ2rT7uVw3yZ1aB4cD/_buildManifest.js': 'self.__BUILD_MANIFEST = {}',
};

let tmp: string;
let server: ReturnType<Koa['listen']>;
let base: string;

beforeAll(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'brclient-static-'));
    const rootDir = path.join(tmp, 'brclient');
    for (const [name, content] of Object.entries(FILES)) {
        fs.mkdirSync(path.dirname(path.join(rootDir, name)), { recursive: true });
        fs.writeFileSync(path.join(rootDir, name), content);
    }
    const rootDirFromCwd = path.relative(process.cwd(), rootDir);
    const app = new Koa();
    app.use(brclientStaticHandler(rootDirFromCwd));
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(tmp, { recursive: true, force: true });
});

async function get(p: string) {
    const r = await fetch(base + p, { redirect: 'manual' });
    return { status: r.status, headers: r.headers, body: await r.text() };
}

describe('brclientStaticHandler', () => {
    it('revalidates pages and other files whose names stay the same across builds', async () => {
        for (const p of [
            '/brclient/',
            '/brclient/index.html',
            '/brclient/404.html',
            '/brclient/index.txt',
            '/brclient/prompts.json',
            '/brclient/favicon.ico',
            '/brclient/serviceWorker.js',
            '/brclient/serviceWorkerRegister.js',
            '/brclient/site.webmanifest',
        ]) {
            const r = await get(p);
            expect(r.status, p).toBe(200);
            expect(r.headers.get('cache-control'), p).toBe('no-cache');
        }
    });

    it('caches content-hashed build files for a year', async () => {
        for (const p of [
            '/brclient/_next/static/chunks/main-3f2a9c1b7d4e5f60.js',
            '/brclient/_next/static/Xk9bQ2rT7uVw3yZ1aB4cD/_buildManifest.js',
        ]) {
            const r = await get(p);
            expect(r.status, p).toBe(200);
            expect(r.headers.get('cache-control'), p).toBe(IMMUTABLE);
        }
    });

    it('serves the file content', async () => {
        const r = await get('/brclient/');
        expect(r.headers.get('content-type')).toMatch(/^text\/html/);
        expect(r.body).toBe('<html>BRCLIENT</html>');
    });

    it('redirects /brclient to /brclient/', async () => {
        const r = await get('/brclient');
        expect(r.status).toBe(302);
        expect(new URL(r.headers.get('location')!, base).pathname).toBe('/brclient/');
    });
});
