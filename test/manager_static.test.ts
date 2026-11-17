import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Koa from 'koa';
import fs from 'fs';
import os from 'os';
import net from 'net';
import path from 'path';
import type { AddressInfo } from 'net';
import { managerStaticHandler } from '../src/middleware/manager_static';
import viteConfig from '../vite.config.js';

let tmp: string;
let server: ReturnType<Koa['listen']>;
let port: number;

beforeAll(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mgr-static-'));
    const staticDir = path.join(tmp, 'frontend');
    for (const dir of ['assets', 'js', 'css', 'img', 'fonts']) {
        fs.mkdirSync(path.join(staticDir, dir), { recursive: true });
    }
    fs.mkdirSync(path.join(tmp, 'server'));
    fs.writeFileSync(path.join(staticDir, 'index.html'), '<html>INDEX</html>');
    fs.writeFileSync(path.join(staticDir, 'assets', 'a.js'), 'console.log(1)');
    fs.writeFileSync(path.join(staticDir, 'js', 'index-B4x9k2Qd.js'), 'console.log(2)');
    fs.writeFileSync(path.join(staticDir, 'css', 'index-D7f3a1Ce.css'), 'body{}');
    fs.writeFileSync(path.join(staticDir, 'img', 'logo-C1d2e3f4.png'), 'png');
    fs.writeFileSync(path.join(staticDir, 'fonts', 'icon-A9b8c7d6.woff2'), 'woff2');
    fs.writeFileSync(path.join(tmp, 'server', 'x'), 'OUTSIDE');
    fs.writeFileSync(path.join(tmp, 'frontend-secret.txt'), 'SECRET');
    const app = new Koa();
    app.use(managerStaticHandler(staticDir));
    app.use(async (ctx) => {
        ctx.status = 200;
        ctx.body = 'NEXT';
    });
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));
    port = (server.address() as AddressInfo).port;
});
afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(tmp, { recursive: true, force: true });
});

// Raw socket request so the client does not normalise the path.
function raw(p: string): Promise<{ status: number; headers: string; body: string }> {
    return new Promise((resolve, reject) => {
        const sock = net.connect(port, '127.0.0.1');
        let buf = '';
        sock.on('data', (d) => (buf += d.toString('latin1')));
        sock.on('error', reject);
        sock.on('close', () => {
            const [head, ...rest] = buf.split('\r\n\r\n');
            resolve({ status: Number(head.split(' ')[1]), headers: head, body: rest.join('\r\n\r\n') });
        });
        sock.write(`GET ${p} HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n`);
    });
}

function cacheControl(headers: string): string | undefined {
    return /^cache-control: (.*)$/im.exec(headers)?.[1];
}

describe('managerStaticHandler', () => {
    it('serves index.html for /manager and /manager/', async () => {
        for (const p of ['/manager', '/manager/']) {
            const r = await raw(p);
            expect(r.status).toBe(200);
            expect(r.body).toContain('INDEX');
        }
    });

    it('serves index.html for paths that resolve to the UI root', async () => {
        for (const p of ['/manager//', '/manager/.', '/manager/sub/..', '/manager/assets/..']) {
            const r = await raw(p);
            expect(r.status, p).toBe(200);
            expect(r.body, p).toContain('INDEX');
        }
    });

    it('falls back to index.html for SPA deep links', async () => {
        const r = await raw('/manager/keys');
        expect(r.status).toBe(200);
        expect(r.body).toContain('INDEX');
    });

    it('serves built assets with their content type', async () => {
        const r = await raw('/manager/assets/a.js');
        expect(r.status).toBe(200);
        expect(r.headers.toLowerCase()).toMatch(/content-type: (application|text)\/javascript/);
        expect(r.body).toContain('console.log(1)');
    });

    it('revalidates index.html on every load', async () => {
        for (const p of ['/manager', '/manager/', '/manager/index.html', '/manager/js/../index.html', '/manager/keys']) {
            const r = await raw(p);
            expect(r.status, p).toBe(200);
            expect(cacheControl(r.headers), p).toBe('no-cache');
        }
    });

    it('caches content-hashed build files for a year', async () => {
        for (const p of [
            '/manager/js/index-B4x9k2Qd.js',
            '/manager/css/index-D7f3a1Ce.css',
            '/manager/img/logo-C1d2e3f4.png',
            '/manager/fonts/icon-A9b8c7d6.woff2',
            '/manager/assets/a.js',
        ]) {
            const r = await raw(p);
            expect(r.status, p).toBe(200);
            expect(cacheControl(r.headers), p).toBe('public, max-age=31536000, immutable');
        }
    });

    it('caches every file the vite build names with a content hash', async () => {
        const { entryFileNames, chunkFileNames, assetFileNames } = viteConfig.build.rollupOptions.output;
        const patterns = [entryFileNames, chunkFileNames, ...['a.css', 'a.png', 'a.woff2', 'a.json'].map((name) => assetFileNames({ name }))];
        for (const pattern of patterns) {
            expect(pattern).toContain('[hash]');
            const name = pattern.replace('[name]', 'built').replace('[hash]', 'Q1w2E3r4').replace('[extname]', '.bin');
            fs.mkdirSync(path.dirname(path.join(tmp, 'frontend', name)), { recursive: true });
            fs.writeFileSync(path.join(tmp, 'frontend', name), 'built');
            expect(cacheControl((await raw(`/manager/${name}`)).headers), name).toBe('public, max-age=31536000, immutable');
        }
    });

    it('404 for paths that resolve outside the UI directory', async () => {
        for (const p of [
            '/manager/../server/x',
            '/manager/../../../../etc/hosts',
            '/manager/../frontend-secret.txt',
            '/manager/assets/../../server/x',
            '/manager../server/x',
        ]) {
            const r = await raw(p);
            expect(r.status, p).toBe(404);
            expect(r.body, p).not.toContain('OUTSIDE');
            expect(r.body, p).not.toContain('SECRET');
        }
    });

    it('404 for paths containing a NUL byte', async () => {
        for (const p of ['/manager/assets/a.js%00', '/manager/%00', '/manager/keys%00.html']) {
            expect((await raw(p)).status, p).toBe(404);
        }
    });

    it('404 for a decoded NUL byte reaching the handler', async () => {
        const handler = managerStaticHandler(path.join(tmp, 'frontend'));
        const ctx: any = { path: '/manager/assets/a.js\0', method: 'GET' };
        const next = async () => {
            throw new Error('next must not be called');
        };
        await handler(ctx, next);
        expect(ctx.status).toBe(404);
    });

    it('passes non-GET and other prefixes through', async () => {
        expect((await raw('/other')).body).toContain('NEXT');
    });
});
