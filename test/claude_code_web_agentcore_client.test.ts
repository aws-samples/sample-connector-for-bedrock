import { describe, expect, it, vi } from 'vitest';
import { invokeRuntime, runtimeRegion, stopRuntimeSession } from '../src/claude_code_web/agentcore_client';
import { CC_SESSION_HEADER } from '../src/claude_code_web/constants';

const ARN = 'arn:aws:bedrock-agentcore:us-west-2:123456789012:runtime/brc_cc_abc-XYZ';
const config = { runtimeArn: ARN, workspaceRoleArn: 'r', bucket: 'b', prefix: 'p' };
const credentials = async () => ({ accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'secretexample' });

function fakeFetch() {
    const calls: { url: string; init: any }[] = [];
    const f = (async (url: any, init: any) => {
        calls.push({ url: String(url), init });
        return new Response('ok', { status: 200 });
    }) as unknown as typeof fetch;
    return { f, calls };
}

describe('agentcore client', () => {
    it('derives the region from the ARN', () => {
        expect(runtimeRegion(ARN)).toBe('us-west-2');
    });

    it('invokes with the once-encoded URL and a SigV4 signature', async () => {
        const { f, calls } = fakeFetch();
        const ac = new AbortController();
        await invokeRuntime(
            config,
            { sessionId: 'sess-1', body: '{"x":1}', contentType: 'application/json', accept: 'text/event-stream', headers: { 'X-Custom': 'v1' }, signal: ac.signal },
            { fetch: f, credentials },
        );
        expect(calls).toHaveLength(1);
        const { url, init } = calls[0];
        expect(url).toBe('https://bedrock-agentcore.us-west-2.amazonaws.com/runtimes/arn%3Aaws%3Abedrock-agentcore%3Aus-west-2%3A123456789012%3Aruntime%2Fbrc_cc_abc-XYZ/invocations?qualifier=DEFAULT');
        const h = Object.fromEntries(Object.entries(init.headers).map(([k, v]) => [k.toLowerCase(), v]));
        expect(String(h.authorization)).toMatch(/^AWS4-HMAC-SHA256 /);
        expect(String(h.authorization)).toContain('/us-west-2/bedrock-agentcore/aws4_request');
        expect(h[CC_SESSION_HEADER.toLowerCase()]).toBe('sess-1');
        expect(h['x-custom']).toBe('v1');
        expect(h['content-type']).toBe('application/json');
        expect(h.accept).toBe('text/event-stream');
        expect(init.body).toBe('{"x":1}');
        expect(init.method).toBe('POST');
        expect(init.signal).toBe(ac.signal);
    });

    it('stops a session via stopruntimesession', async () => {
        const { f, calls } = fakeFetch();
        const r = await stopRuntimeSession(config, 'sess-2', { fetch: f, credentials });
        expect(r).toEqual({ status: 200, body: 'ok' });
        expect(calls[0].url).toMatch(/\/stopruntimesession\?qualifier=DEFAULT$/);
        expect(calls[0].init.body).toBe('{}');
        const h = Object.fromEntries(Object.entries(calls[0].init.headers).map(([k, v]) => [k.toLowerCase(), v]));
        expect(h[CC_SESSION_HEADER.toLowerCase()]).toBe('sess-2');
        expect(String(h.authorization)).toMatch(/^AWS4-HMAC-SHA256 /);
    });
});

describe('default credential chain', () => {
    it('builds the default provider once and reuses it', async () => {
        vi.resetModules();
        const provider = vi.fn(async () => ({ accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'secretexample' }));
        const defaultProvider = vi.fn(() => provider);
        vi.doMock('@aws-sdk/credential-provider-node', () => ({ defaultProvider }));
        const mod = await import('../src/claude_code_web/agentcore_client');
        const { f } = fakeFetch();
        await mod.invokeRuntime(config, { sessionId: 's', body: '{}', contentType: 'application/json', headers: {} }, { fetch: f });
        await mod.invokeRuntime(config, { sessionId: 's', body: '{}', contentType: 'application/json', headers: {} }, { fetch: f });
        expect(defaultProvider).toHaveBeenCalledTimes(1);
        expect(provider).toHaveBeenCalledTimes(2);
        vi.doUnmock('@aws-sdk/credential-provider-node');
    });
});
