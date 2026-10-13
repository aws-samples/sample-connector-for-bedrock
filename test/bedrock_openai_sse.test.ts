import { describe, it, expect } from 'vitest';
import { relayChatStream } from '../src/providers/bedrock_openai/sse';

async function* source(...parts: (string | Uint8Array)[]) { for (const p of parts) yield typeof p === 'string' ? Buffer.from(p) : p; }
const ev = (o: any) => `data: ${JSON.stringify(o)}\n\n`;
const content = (t: string) => ev({ id: 'c1', object: 'chat.completion.chunk', choices: [{ index: 0, delta: { content: t } }] });
const finish = ev({ id: 'c1', object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] });
const USAGE = { prompt_tokens: 92, completion_tokens: 57, prompt_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 } };
const usage = ev({ id: 'c1', object: 'chat.completion.chunk', choices: [], usage: USAGE });
const DONE = 'data: [DONE]\n\n';
async function run(parts: (string | Uint8Array)[], forwardUsageChunk = false) {
    const written: string[] = [];
    const result = await relayChatStream(source(...parts), (s) => written.push(s), { forwardUsageChunk });
    return { written, result };
}

describe('relayChatStream', () => {
    it('forwards content events unchanged and collects the text', async () => {
        const { written, result } = await run([content('Hello '), content('world'), finish, DONE]);
        expect(written).toEqual([content('Hello '), content('world'), finish, DONE]);
        expect(result).toMatchObject({ text: 'Hello world', usage: null, sawDone: true });
    });
    it('captures usage and drops the usage-only chunk the client did not ask for', async () => {
        const { written, result } = await run([content('Hi'), finish, usage, DONE]);
        expect(written).toEqual([content('Hi'), finish, DONE]);
        expect(result.usage).toEqual(USAGE);
    });
    it('forwards the usage chunk when the client asked for it', async () => {
        const { written } = await run([content('Hi'), usage, DONE], true);
        expect(written).toEqual([content('Hi'), usage, DONE]);
    });
    it('handles events split across chunks and CRLF separators', async () => {
        const whole = [content('Hello '), content('world'), usage, DONE].join('').replace(/\n/g, '\r\n');
        const { written, result } = await run(whole.match(/[\s\S]{1,7}/g)!);
        expect(written).toEqual([content('Hello '), content('world'), DONE]);
        expect(result).toMatchObject({ text: 'Hello world', usage: USAGE });
    });
    it('joins a CRLF that is cut between chunks', async () => {
        const a = 'data: {"id":"c1","choices":[{"index":0,"delta":{"content":"a"}}]}';
        const { written, result } = await run([a + '\r', '\n\r', '\ndata: [DONE]\r\n\r\n']);
        expect(written).toEqual([a + '\n\n', DONE]);
        expect(result).toMatchObject({ text: 'a', sawDone: true });
    });
    it('keeps multi-byte characters split across chunks', async () => {
        const bytes = Buffer.from(content('你好'));
        const cut = bytes.indexOf(Buffer.from('你')) + 1;
        const { result } = await run([bytes.subarray(0, cut), bytes.subarray(cut), DONE]);
        expect(result.text).toBe('你好');
    });
    it('forwards comments and non-JSON data unchanged', async () => {
        const { written } = await run([': keep-alive\n\n', 'data: not-json\n\n', DONE]);
        expect(written).toEqual([': keep-alive\n\n', 'data: not-json\n\n', DONE]);
    });
    it('keeps a chunk that carries both choices and usage', async () => {
        const both = ev({ id: 'c1', choices: [{ index: 0, delta: { content: 'x' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } });
        const { written, result } = await run([both, DONE]);
        expect(written).toEqual([both, DONE]);
        expect(result.usage?.prompt_tokens).toBe(1);
    });
    it('processes a final event that lacks the blank line', async () => {
        const { written, result } = await run([content('a'), 'data: [DONE]']);
        expect(written).toEqual([content('a'), DONE]);
        expect(result.sawDone).toBe(true);
    });
    it('returns what it has when the source fails mid-stream', async () => {
        async function* failing() { yield Buffer.from(content('partial')); throw new Error('socket reset'); }
        const written: string[] = [];
        const result = await relayChatStream(failing(), (s) => written.push(s), { forwardUsageChunk: false });
        expect(written).toEqual([content('partial')]);
        expect(result.text).toBe('partial');
        expect(result.error).toBeInstanceOf(Error);
    });
    // Bedrock answers streams with connection: close and often resets the socket right after [DONE].
    it('treats a connection reset after [DONE] as a normal end', async () => {
        async function* resetAfterDone() {
            yield Buffer.from(content('OK'));
            yield Buffer.from(usage);
            yield Buffer.from(DONE);
            throw Object.assign(new Error('aborted'), { code: 'ECONNRESET' });
        }
        const written: string[] = [];
        const result = await relayChatStream(resetAfterDone(), (s) => written.push(s), { forwardUsageChunk: false });
        expect(written).toEqual([content('OK'), DONE]);
        expect(result).toMatchObject({ text: 'OK', usage: USAGE, sawDone: true });
        expect(result.error).toBeUndefined();
    });
    it('relays a [DONE] that the reset cut off before its blank line, and ends normally', async () => {
        async function* resetInsideDone() {
            yield Buffer.from(content('OK'));
            yield Buffer.from('data: [DONE]');
            throw Object.assign(new Error('aborted'), { code: 'ECONNRESET' });
        }
        const written: string[] = [];
        const result = await relayChatStream(resetInsideDone(), (s) => written.push(s), { forwardUsageChunk: false });
        expect(written).toEqual([content('OK'), DONE]);
        expect(result).toMatchObject({ text: 'OK', sawDone: true });
        expect(result.error).toBeUndefined();
    });
    // Streams always ask for usage, and the usage-only chunk is the last one before [DONE].
    it('ends a stream reset after its usage chunk with a [DONE] for the client', async () => {
        async function* resetAfterUsage() {
            yield Buffer.from(content('OK'));
            yield Buffer.from(usage);
            throw Object.assign(new Error('aborted'), { code: 'ECONNRESET' });
        }
        const written: string[] = [];
        const result = await relayChatStream(resetAfterUsage(), (s) => written.push(s), { forwardUsageChunk: false });
        expect(written).toEqual([content('OK'), DONE]);
        expect(result).toMatchObject({ text: 'OK', usage: USAGE, sawDone: true });
        expect(result.error).toBeUndefined();
    });
    it('does not add a [DONE] after a failed write', async () => {
        const failure = new Error('client socket closed');
        let failed = false;
        const written: string[] = [];
        const write = (s: string) => { if (s === DONE && !failed) { failed = true; throw failure; } written.push(s); };
        const result = await relayChatStream(source(content('OK'), usage, DONE), write, { forwardUsageChunk: false });
        expect(written).toEqual([content('OK')]);
        expect(result.sawDone).toBe(false);
        expect(result.error).toBe(failure);
    });
    it('does not relay a buffered [DONE] after a failed write', async () => {
        const failure = new Error('client socket closed');
        const written: string[] = [];
        const result = await relayChatStream(source(content('a') + 'data: [DONE]'), (s) => { if (s !== DONE) throw failure; written.push(s); }, { forwardUsageChunk: false });
        expect(written).toEqual([]);
        expect(result.sawDone).toBe(false);
        expect(result.error).toBe(failure);
    });
    it('reports a failed write of [DONE] as an error', async () => {
        const failure = new Error('client socket closed');
        const result = await relayChatStream(source(content('OK'), DONE), (s) => { if (s === DONE) throw failure; }, { forwardUsageChunk: false });
        expect(result.sawDone).toBe(false);
        expect(result.error).toBe(failure);
    });

    it('relays each event once when a chunk holds several and ends inside another', async () => {
        const c = content('c');
        const { written, result } = await run([content('a') + content('b') + c.slice(0, 10), c.slice(10) + finish + DONE]);
        expect(written).toEqual([content('a'), content('b'), c, finish, DONE]);
        expect(result.text).toBe('abc');
    });
    it('joins multi-line data and accepts a data: field without a space', async () => {
        const multiline = 'data:{"id":"c1","choices":[{"index":0,\ndata: "delta":{"content":"x"}}]}\n\n';
        const { written, result } = await run([multiline, DONE]);
        expect(written).toEqual([multiline, DONE]);
        expect(result.text).toBe('x');
    });
    it('skips blank lines between events and after the last one', async () => {
        const { written } = await run([content('a'), '\n\n\n', content('b'), 'data: [DONE]\n']);
        expect(written).toEqual([content('a'), content('b'), DONE]);
    });
    it('collects only string content', async () => {
        const delta = (c: any) => ev({ id: 'c1', choices: [{ index: 0, delta: { content: c } }] });
        const { result } = await run([delta(null), delta('a'), delta(['b']), delta({ text: 'c' }), delta(7), DONE]);
        expect(result.text).toBe('a');
    });
    it('keeps the last non-null usage', async () => {
        const withUsage = (u: any) => ev({ id: 'c1', choices: [{ index: 0, delta: { content: 'x' } }], usage: u });
        const { result } = await run([withUsage({ prompt_tokens: 1 }), withUsage(null), withUsage({ prompt_tokens: 2 }), withUsage(null), DONE]);
        expect(result.usage).toEqual({ prompt_tokens: 2 });
    });
    it('hides a usage chunk only when its choices array is empty', async () => {
        const noChoices = ev({ id: 'c1', usage: USAGE });
        const { written, result } = await run([noChoices, DONE]);
        expect(written).toEqual([noChoices, DONE]);
        expect(result.usage).toEqual(USAGE);
    });
    it('accepts string chunks as well as bytes', async () => {
        async function* strings() { yield content('Hel'); yield content('lo') + DONE; }
        const written: string[] = [];
        const result = await relayChatStream(strings(), (s) => written.push(s), { forwardUsageChunk: false });
        expect(written).toEqual([content('Hel'), content('lo'), DONE]);
        expect(result.text).toBe('Hello');
    });
    it('does not write a half-received event when the source fails', async () => {
        async function* failing() { yield Buffer.from(content('ok') + 'data: {"id":"c1","choi'); throw new Error('socket reset'); }
        const written: string[] = [];
        const result = await relayChatStream(failing(), (s) => written.push(s), { forwardUsageChunk: false });
        expect(written).toEqual([content('ok')]);
        expect(result.error).toBeInstanceOf(Error);
    });
    it('returns the error instead of throwing when write fails, and stops reading', async () => {
        let pulled = 0;
        async function* chunks() { for (const p of [content('a'), content('b'), DONE]) { pulled++; yield Buffer.from(p); } }
        const result = await relayChatStream(chunks(), () => { throw new Error('write after end'); }, { forwardUsageChunk: false });
        expect(result.error).toBeInstanceOf(Error);
        expect(pulled).toBe(1);
    });
});
