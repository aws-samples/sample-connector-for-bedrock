import { describe, it, expect } from 'vitest';
import { relayAnthropicStream, PING_EVENT } from '../src/providers/bedrock_anthropic/sse';

async function* source(...parts: (string | Uint8Array)[]) { for (const p of parts) yield typeof p === 'string' ? Buffer.from(p) : p; }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const e = (type: string, data: any) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
const start = e('message_start', { message: { id: 'm', usage: { input_tokens: 2, cache_read_input_tokens: 90868, cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 }, output_tokens: 1 } } });
const text = (t: string) => e('content_block_delta', { index: 0, delta: { type: 'text_delta', text: t } });
const delta = e('message_delta', { delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 4 } });
const stop = e('message_stop', {});

describe('relayAnthropicStream with a hand-written iterator', () => {
    it('accepts next() that returns plain result objects', async () => {
        const parts = [Buffer.from(start), Buffer.from(stop)]; let i = 0;
        const source: any = { [Symbol.asyncIterator]: () => ({ next: () => (i < parts.length ? { done: false, value: parts[i++] } : { done: true, value: undefined }) }) };
        const r = await relayAnthropicStream(source, () => {});
        expect(r).toMatchObject({ sawMessageStop: true, wroteAny: true });
        expect(r.error).toBeUndefined();
    });
});

describe('relayAnthropicStream', () => {
    it('relays events verbatim and collects usage and text', async () => {
        const written: string[] = [];
        const r = await relayAnthropicStream(source(start, text('O'), text('K'), delta, stop), (s) => written.push(s));
        expect(written).toEqual([start, text('O'), text('K'), delta, stop]);
        expect(r).toMatchObject({ text: 'OK', sawMessageStop: true, wroteAny: true, usage: { input_tokens: 2, cache_read_input_tokens: 90868, output_tokens: 4 } });
    });
    it('collects tool_use input from input_json_delta', async () => {
        const open = e('content_block_start', { index: 1, content_block: { type: 'tool_use', name: 'Bash', id: 't' } });
        const d = (p: string) => e('content_block_delta', { index: 1, delta: { type: 'input_json_delta', partial_json: p } });
        const close = e('content_block_stop', { index: 1 });
        const r = await relayAnthropicStream(source(start, open, d('{"command":'), d('"ls"}'), close, stop), () => {});
        expect(r.toolUses).toEqual([{ type: 'tool_use', name: 'Bash', input: { command: 'ls' } }]);
    });
    it('keeps the raw string for invalid tool input and {} for empty input', async () => {
        const open = (i: number, name: string) => e('content_block_start', { index: i, content_block: { type: 'tool_use', name, id: 't' + i } });
        const d = (i: number, p: string) => e('content_block_delta', { index: i, delta: { type: 'input_json_delta', partial_json: p } });
        const close = (i: number) => e('content_block_stop', { index: i });
        const r = await relayAnthropicStream(source(start, open(1, 'A'), d(1, '{"x":'), close(1), open(2, 'B'), close(2), stop), () => {});
        expect(r.toolUses).toEqual([
            { type: 'tool_use', name: 'A', input: '{"x":' },
            { type: 'tool_use', name: 'B', input: {} },
        ]);
    });
    it('sends ping while upstream is silent after the first event, and stops when it ends', async () => {
        async function* slow() { yield Buffer.from(start); await sleep(70); yield Buffer.from(stop); }
        const written: string[] = [];
        await relayAnthropicStream(slow(), (s) => written.push(s), { pingIntervalMs: 20 });
        expect(written.filter((w) => w === PING_EVENT).length).toBeGreaterThanOrEqual(2);
        expect(written[0]).toBe(start);
        expect(written[written.length - 1]).toBe(stop);
        const n = written.length; await sleep(60); expect(written.length).toBe(n);
    });
    it('does not ping before the first event', async () => {
        async function* late() { await sleep(50); yield Buffer.from(start); yield Buffer.from(stop); }
        const written: string[] = [];
        await relayAnthropicStream(late(), (s) => written.push(s), { pingIntervalMs: 20 });
        expect(written).toEqual([start, stop]);
    });
    it('stops pinging when the source fails', async () => {
        async function* failing() { yield Buffer.from(start); await sleep(50); throw new Error('boom'); }
        const written: string[] = [];
        const r = await relayAnthropicStream(failing(), (s) => written.push(s), { pingIntervalMs: 20 });
        expect(r.error).toBeInstanceOf(Error);
        const n = written.length; await sleep(60); expect(written.length).toBe(n);
    });
    it('treats a throwing ping write as a failed write and stops pinging', async () => {
        async function* slow() { yield Buffer.from(start); await sleep(100); yield Buffer.from(stop); }
        const written: string[] = [];
        const r = await relayAnthropicStream(slow(), (s) => { if (s === PING_EVENT) throw new Error('closed'); written.push(s); }, { pingIntervalMs: 20 });
        expect((r.error as Error).message).toBe('closed');
        expect(r.sawMessageStop).toBe(false);
        expect(written).toEqual([start]);
    });
    it('forwards an upstream error event and reports the stream as incomplete', async () => {
        const err = e('error', { error: { type: 'overloaded_error', message: 'Overloaded' } });
        const written: string[] = [];
        const r = await relayAnthropicStream(source(start, err), (s) => written.push(s));
        expect(written).toEqual([start, err]);
        expect(r.sawMessageStop).toBe(false); expect(r.usage?.input_tokens).toBe(2);
    });
    it('keeps multi-byte characters and CRLF split across chunks', async () => {
        const whole = Buffer.from([start, text('你好'), delta, stop].join('').replace(/\n/g, '\r\n'));
        const cut = whole.indexOf(Buffer.from('你')) + 1;
        const parts: Uint8Array[] = [];
        for (let i = 0; i < whole.length; i += 7) parts.push(whole.subarray(i, i + 7));
        const written: string[] = [];
        const r = await relayAnthropicStream(source(...parts), (s) => written.push(s));
        expect(cut).toBeGreaterThan(0);
        expect(written).toEqual([start, text('你好'), delta, stop]);
        expect(r.text).toBe('你好');
    });
    it('stops reading after a failed write and never throws', async () => {
        let pulled = 0;
        async function* counted() { for (const p of [start, text('a'), text('b'), text('c'), stop]) { pulled++; yield Buffer.from(p); } }
        let calls = 0;
        const r = await relayAnthropicStream(counted(), () => { if (++calls === 2) throw new Error('closed'); });
        expect((r.error as Error).message).toBe('closed');
        expect(pulled).toBeLessThanOrEqual(2);
        expect(r.sawMessageStop).toBe(false);
    });
    it('drops a half-received event when the source fails', async () => {
        async function* failing() { yield Buffer.from(start + 'event: content_bl'); throw new Error('reset'); }
        const written: string[] = [];
        const r = await relayAnthropicStream(failing(), (s) => written.push(s));
        expect(written).toEqual([start]);
        expect((r.error as Error).message).toBe('reset');
    });
    it('drops a half-received event when the source ends normally', async () => {
        const written: string[] = [];
        const r = await relayAnthropicStream(source(start + 'event: content_bl'), (s) => written.push(s));
        expect(written).toEqual([start]);
        expect(r.error).toBeUndefined();
    });
    it('relays a final complete event that lacks the trailing blank line', async () => {
        const written: string[] = [];
        const r = await relayAnthropicStream(source(start, 'event: message_stop\ndata: {"type":"message_stop"}'), (s) => written.push(s));
        expect(written).toEqual([start, 'event: message_stop\ndata: {"type":"message_stop"}\n\n']);
        expect(r.sawMessageStop).toBe(true);
    });
});
