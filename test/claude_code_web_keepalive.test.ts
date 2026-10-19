import { PassThrough } from 'stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withSseKeepalive } from '../src/claude_code_web/sse_keepalive';

function collect(s: NodeJS.ReadableStream): { text: () => string } {
    let buf = '';
    s.on('data', (c) => (buf += c.toString()));
    return { text: () => buf };
}

describe('withSseKeepalive', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('writes a keepalive after quiet time at an event boundary', async () => {
        const src = new PassThrough();
        const out = collect(withSseKeepalive(src));
        src.write('data: {"a":1}\n\n');
        await vi.advanceTimersByTimeAsync(16000);
        expect(out.text()).toBe('data: {"a":1}\n\n: keepalive\n\n');
    });

    it('never injects inside a partially written event', async () => {
        const src = new PassThrough();
        const out = collect(withSseKeepalive(src));
        src.write('data: {"a"');
        await vi.advanceTimersByTimeAsync(16000);
        expect(out.text()).toBe('data: {"a"');
        src.write(':1}\n\n');
        await vi.advanceTimersByTimeAsync(1);
        expect(out.text()).toBe('data: {"a":1}\n\n');
    });

    it('detects a boundary split across chunks', async () => {
        const src = new PassThrough();
        const out = collect(withSseKeepalive(src));
        src.write('data: x\n');
        src.write('\n');
        await vi.advanceTimersByTimeAsync(16000);
        expect(out.text()).toBe('data: x\n\n: keepalive\n\n');
    });

    it('writes nothing after the source ends', async () => {
        const src = new PassThrough();
        const out = collect(withSseKeepalive(src));
        src.end('data: 1\n\n');
        await vi.advanceTimersByTimeAsync(100);
        const before = out.text();
        await vi.advanceTimersByTimeAsync(60000);
        expect(out.text()).toBe(before);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('destroys the source when the output is destroyed and clears the timer', async () => {
        const src = new PassThrough();
        const out = withSseKeepalive(src);
        out.on('error', () => {});
        src.write('data: 1\n\n');
        await vi.advanceTimersByTimeAsync(1);
        out.destroy();
        await vi.advanceTimersByTimeAsync(1);
        expect(src.destroyed).toBe(true);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('propagates source errors to the output', async () => {
        const src = new PassThrough();
        const out = withSseKeepalive(src);
        const err = new Promise((r) => out.on('error', r));
        src.destroy(new Error('boom'));
        expect(((await err) as Error).message).toBe('boom');
        expect(vi.getTimerCount()).toBe(0);
    });
});
