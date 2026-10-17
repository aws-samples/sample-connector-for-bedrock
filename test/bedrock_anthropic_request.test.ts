import { describe, it, expect } from 'vitest';
import { betaDenylist, BetaDenylist, betasOf, buildNativeRequest, parseRejectedBetas } from '../src/providers/bedrock_anthropic/request';

const cc = { model: 'claude-sonnet-5-5', max_tokens: 32000, stream: true, metadata: { user_id: '{"device_id":"x"}' },
  system: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b', cache_control: { type: 'ephemeral' } }],
  thinking: { type: 'adaptive', display: 'omitted' }, output_config: { effort: 'medium' }, context_management: { edits: [{ type: 'clear_thinking_20251015', keep: 'all' }] },
  safeguards: [{ type: 'dangerous_tool_use' }], tools: [{ name: 'Bash', description: 'd', input_schema: { type: 'object' } }],
  messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }, { role: 'assistant', content: [{ type: 'thinking', thinking: '', signature: 'sig==' }, { type: 'text', text: 'ok' }] }] };
it('changes only model and metadata, and keeps stream as sent', () => {
    const r = buildNativeRequest(cc, 'global.anthropic.claude-sonnet-5-5', ['claude-code-20250219']);
    const { model, metadata, ...rest } = cc;
    expect(JSON.parse(r.json)).toEqual({ ...rest, model: 'global.anthropic.claude-sonnet-5-5' });
    expect(r.stream).toBe(true);
    expect(cc.model).toBe('claude-sonnet-5-5');
    expect(r.headers).toEqual({ 'anthropic-version': '2023-06-01', 'anthropic-beta': 'claude-code-20250219' });
});
it('omits anthropic-beta when no beta is left, and keeps the client anthropic-version', () => {
    expect(buildNativeRequest({ model: 'x', messages: [] }, 'm', [], '2023-01-01').headers).toEqual({ 'anthropic-version': '2023-01-01' });
});
it('normalises the beta header', () => {
    expect(betasOf(' a, b,,a ')).toEqual(['a', 'b']);
    expect(betasOf(['a,b', 'c'])).toEqual(['a', 'b', 'c']);
    expect(betasOf(undefined)).toEqual([]);
});
it("reads the rejected values from Bedrock's message", () => {
    const body = '{"type":"error","error":{"type":"invalid_request_error","message":"Unexpected value(s) `prompt-caching-scope-2026-01-05`, `x-2099` for the `anthropic-beta` header. Please consult our documentation at platform.claude.com/docs or try again without the header."}}';
    expect(parseRejectedBetas(body)).toEqual(['prompt-caching-scope-2026-01-05', 'x-2099']);
    expect(parseRejectedBetas('{"type":"error","error":{"type":"invalid_request_error","message":"max_tokens: Field required"}}')).toEqual([]);
});
it('remembers rejected betas per model id', () => {
    const d = new BetaDenylist(); d.add('m1', ['p']);
    expect(d.strip('m1', ['a', 'p'])).toEqual(['a']);
    expect(d.strip('m2', ['a', 'p'])).toEqual(['a', 'p']);
});

describe('parseRejectedBetas leniency and limits', () => {
    const text = (v: string) => `Unexpected value(s) \`${v}\` for the \`anthropic-beta\` header. Please consult our documentation at platform.claude.com/docs or try again without the header.`;
    it('reads the real captured body', () => {
        const body = '{"type":"error","error":{"type":"invalid_request_error","message":"' + text('prompt-caching-scope-2026-01-05') + '"}}';
        expect(parseRejectedBetas(body)).toEqual(['prompt-caching-scope-2026-01-05']);
    });
    it('reads the AWS envelope, both message spellings, a prefixed message and raw text', () => {
        expect(parseRejectedBetas(JSON.stringify({ message: text('a-1') }))).toEqual(['a-1']);
        expect(parseRejectedBetas(JSON.stringify({ Message: text('a-2') }))).toEqual(['a-2']);
        expect(parseRejectedBetas(JSON.stringify({ message: 'Validation error: ' + text('a-3') }))).toEqual(['a-3']);
        expect(parseRejectedBetas(text('a-4'))).toEqual(['a-4']);
    });
    it('reads two values and returns [] for a body that does not match', () => {
        expect(parseRejectedBetas(JSON.stringify({ message: text('a-1`, `b-2') }))).toEqual(['a-1', 'b-2']);
        expect(parseRejectedBetas('{"message":"nothing to see"}')).toEqual([]);
    });
});
describe('BetaDenylist limits', () => {
    it('learns only well-formed beta names', () => {
        const d = new BetaDenylist(); d.add('m', ['ok-1', 'Bad Value', '', 'x'.repeat(65), '-lead', 'a'.repeat(64)]);
        expect(d.strip('m', ['ok-1', 'Bad Value', '', 'x'.repeat(65), '-lead', 'a'.repeat(64)])).toEqual(['Bad Value', '', 'x'.repeat(65), '-lead']);
    });
    it('caps each model at 64 entries and evicts the oldest for a new value', () => {
        const d = new BetaDenylist();
        d.add('m', Array.from({ length: 70 }, (_, i) => `b-${i}`));
        // 70 values into 64 slots: the six oldest are gone, the newest 64 are kept.
        expect(d.strip('m', ['b-0', 'b-5', 'b-6', 'b-69'])).toEqual(['b-0', 'b-5']);
        d.add('m', ['late']);
        expect(d.strip('m', ['late'])).toEqual([]);
        expect(d.strip('m', ['b-6'])).toEqual(['b-6']);
        expect(d.strip('m', ['b-7'])).toEqual([]);
        d.add('other', ['late']);
        expect(d.strip('other', ['late'])).toEqual([]);
    });
});
it('falls back to 2023-06-01 for an empty anthropic-version', () => {
    expect(buildNativeRequest({ model: 'x' }, 'm', [], '').headers['anthropic-version']).toBe('2023-06-01');
});
