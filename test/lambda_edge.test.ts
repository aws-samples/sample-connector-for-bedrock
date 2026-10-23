import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import path from 'node:path';
import vm from 'node:vm';

const template = readFileSync(path.join(__dirname, '../cloudformation/lambda-edge-use1.yaml'), 'utf8');

function inlineSource(): string {
    const lines = template.split('\n');
    const start = lines.findIndex(l => /^\s*ZipFile: \|/.test(l));
    const indent = lines[start + 1].match(/^\s*/)![0].length;
    const body: string[] = [];
    for (let i = start + 1; i < lines.length; i++) {
        if (lines[i].trim() !== '' && lines[i].match(/^\s*/)![0].length < indent) break;
        body.push(lines[i].slice(indent));
    }
    return body.join('\n');
}

function loadHandler(sink: (...a: any[]) => void) {
    const nodeRequire = createRequire(import.meta.url);
    const mod: any = { exports: {} };
    const sandbox: any = {
        module: mod,
        exports: mod.exports,
        require: nodeRequire,
        Buffer,
        console: { log: sink, info: sink, warn: sink, error: sink, debug: sink },
    };
    vm.runInNewContext(inlineSource(), sandbox);
    return mod.exports.handler as (e: any) => Promise<any>;
}

function event(opts: { authorization?: string; method: string; body?: string }) {
    const headers: any = {};
    if (opts.authorization) headers.authorization = [{ key: 'Authorization', value: opts.authorization }];
    const request: any = { method: opts.method, headers, uri: '/v1/messages' };
    if (opts.body !== undefined) request.body = { data: Buffer.from(opts.body).toString('base64') };
    return { Records: [{ cf: { request } }] };
}

describe('Lambda@Edge function', () => {
    it('copies Authorization without logging it', async () => {
        const calls: any[] = [];
        const handler = loadHandler((...a) => calls.push(a));
        const req = await handler(event({ authorization: 'Bearer SECRET-MARKER', method: 'GET' }));
        expect(req.headers['saved-authorization'][0].value).toBe('Bearer SECRET-MARKER');
        expect(JSON.stringify(calls)).not.toContain('SECRET-MARKER');
        expect(calls).toHaveLength(0);
    });

    it('hashes the POST body', async () => {
        const handler = loadHandler(() => {});
        const req = await handler(event({ method: 'POST', body: '{"a":1}' }));
        expect(req.headers['x-amz-content-sha256'][0].value).toBe(createHash('sha256').update('{"a":1}').digest('hex'));
    });

    it('uses the empty-body hash when there is no body', async () => {
        const handler = loadHandler(() => {});
        const req = await handler(event({ method: 'POST' }));
        expect(req.headers['x-amz-content-sha256'][0].value).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });

    it('runs on nodejs24.x', () => {
        expect(template).toMatch(/Runtime: nodejs24\.x/);
        expect(template).not.toMatch(/nodejs18\.x/);
    });

    it('publishes a new version', () => {
        expect(template).toMatch(/Description: v2\b/);
    });
});
