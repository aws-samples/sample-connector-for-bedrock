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
});

// The error event always leads with a blank line so it can never join a half-written event.
const ERROR_EVENT = '\n\ndata: {"type":"error","error":"upstream closed"}\n\n';

// Resolves with everything the output emitted once it ends; rejects if it errors instead.
function drain(out: NodeJS.ReadableStream): Promise<string> {
    return new Promise((resolve, reject) => {
        let buf = '';
        out.on('data', (c) => (buf += c.toString()));
        out.on('end', () => resolve(buf));
        out.on('error', reject);
    });
}

describe('withSseKeepalive when the source stops early', () => {
    it('ends the output with an error event when the source fails mid-stream', async () => {
        const src = new PassThrough();
        const out = withSseKeepalive(src);
        const text = drain(out);
        src.write('data: {"a":1}\n\n');
        await new Promise((r) => setImmediate(r));
        src.destroy(new Error('boom'));
        expect(await text).toBe('data: {"a":1}\n\n' + ERROR_EVENT);
    });

    it('closes a half-written event before the error event', async () => {
        const src = new PassThrough();
        const out = withSseKeepalive(src);
        const text = drain(out);
        src.write('data: {"a"');
        await new Promise((r) => setImmediate(r));
        src.destroy(new Error('boom'));
        expect(await text).toBe('data: {"a"' + ERROR_EVENT);
    });

    it('keeps the error event on its own lines when a half-written event is still buffered', async () => {
        const src = new PassThrough();
        const out = withSseKeepalive(src);
        out.on('error', () => {});
        // Nobody reads yet, so the half event sits in the output buffer when the source fails.
        src.write('data: {"a"');
        src.destroy(new Error('boom'));
        await new Promise((r) => setImmediate(r));
        const text = await drain(out);
        expect(text).toBe('data: {"a"' + ERROR_EVENT);
        expect(text.split('\n\n').pop()).toBe('');
        expect(text).toContain('\n\ndata: {"type":"error"');
    });

    it('ends the output when the source is destroyed without an error', async () => {
        const src = new PassThrough();
        const out = withSseKeepalive(src);
        const text = drain(out);
        src.write('data: 1\n\n');
        await new Promise((r) => setImmediate(r));
        src.destroy();
        expect(await text).toBe('data: 1\n\n' + ERROR_EVENT);
    });

    it('reports the early stop, and only that', async () => {
        const seen: (Error | undefined)[] = [];
        const failing = new PassThrough();
        const t1 = drain(withSseKeepalive(failing, { onSourceStopped: (e) => seen.push(e) }));
        failing.destroy(new Error('boom'));
        await t1;
        const closed = new PassThrough();
        const t2 = drain(withSseKeepalive(closed, { onSourceStopped: (e) => seen.push(e) }));
        closed.destroy();
        await t2;
        const ending = new PassThrough();
        const t3 = drain(withSseKeepalive(ending, { onSourceStopped: (e) => seen.push(e) }));
        ending.end('data: 1\n\n');
        expect(await t3).toBe('data: 1\n\n');
        expect(seen.map((e) => e?.message)).toEqual(['boom', undefined]);
    });

    it('stays silent when the consumer destroyed the output', async () => {
        const seen: unknown[] = [];
        const src = new PassThrough();
        const out = withSseKeepalive(src, { onSourceStopped: (e) => seen.push(e) });
        const chunks: string[] = [];
        out.on('data', (c) => chunks.push(c.toString()));
        out.on('error', (e) => seen.push(e));
        src.write('data: 1\n\n');
        await new Promise((r) => setImmediate(r));
        out.destroy();
        await new Promise((r) => setImmediate(r));
        expect(src.destroyed).toBe(true);
        expect(chunks.join('')).toBe('data: 1\n\n');
        expect(seen).toEqual([]);
    });

    it('clears the keepalive timer after an early stop', async () => {
        vi.useFakeTimers();
        try {
            const src = new PassThrough();
            const out = withSseKeepalive(src);
            const text = drain(out);
            src.destroy(new Error('boom'));
            await vi.advanceTimersByTimeAsync(1);
            expect(await text).toBe(ERROR_EVENT);
            await vi.advanceTimersByTimeAsync(60000);
            expect(vi.getTimerCount()).toBe(0);
        } finally {
            vi.useRealTimers();
        }
    });
});

describe('withSseKeepalive edge cases', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('treats nothing written yet as a boundary', async () => {
        const src = new PassThrough();
        const out = collect(withSseKeepalive(src));
        await vi.advanceTimersByTimeAsync(16000);
        expect(out.text()).toBe(': keepalive\n\n');
    });

    it('keeps the final event intact when the source ends while the output is paused', async () => {
        const src = new PassThrough();
        const out = withSseKeepalive(src);
        const errors: Error[] = [];
        out.on('error', (e) => errors.push(e));
        src.end('data: last\n\n');
        await vi.advanceTimersByTimeAsync(20000);
        let buf = '';
        out.on('data', (c) => (buf += c.toString()));
        await vi.advanceTimersByTimeAsync(20000);
        expect(errors).toEqual([]);
        expect(buf).toBe('data: last\n\n');
    });
});
