import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Koa from 'koa';
import fs from 'fs';
import os from 'os';
import net from 'net';
import path from 'path';
import type { AddressInfo } from 'net';
import { managerStaticHandler } from '../src/middleware/manager_static';

let tmp: string;
let server: ReturnType<Koa['listen']>;
let port: number;

beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mgr-static-'));
    const staticDir = path.join(tmp, 'frontend');
    fs.mkdirSync(path.join(staticDir, 'assets'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'server'));
    fs.writeFileSync(path.join(staticDir, 'index.html'), '<html>INDEX</html>');
    fs.writeFileSync(path.join(staticDir, 'assets', 'a.js'), 'console.log(1)');
    fs.writeFileSync(path.join(tmp, 'server', 'x'), 'OUTSIDE');
    fs.writeFileSync(path.join(tmp, 'frontend-secret.txt'), 'SECRET');
    const app = new Koa();
    app.use(managerStaticHandler(staticDir));
    app.use(async (ctx) => {
        ctx.status = 200;
        ctx.body = 'NEXT';
    });
    server = app.listen(0);
    port = (server.address() as AddressInfo).port;
});
afterAll(() => {
    server.close();
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

describe('managerStaticHandler', () => {
    it('serves index.html for /manager and /manager/', async () => {
        for (const p of ['/manager', '/manager/']) {
            const r = await raw(p);
            expect(r.status).toBe(200);
            expect(r.body).toContain('INDEX');
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
