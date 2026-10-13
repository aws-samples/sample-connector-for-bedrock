import { describe, it, expect, afterEach } from 'vitest';
import Cache from '../src/util/cache';
import { recordChatUsage } from '../src/providers/usage_recorder';
import { fakeDb } from './helpers/fakes';

const model = { id: 5, name: 'kimi-k3', provider: 'bedrock-runtime-openai', multiple: 1, model_type: 1, price_in: 3e-6, price_out: 15e-6, config: {} };
const key = { id: 7, month_fee: '1', month_quota: '10', balance: '0', total_fee: '2' };
const cost = { tokens_in: 2916, tokens_out: 10, cached_tokens: 2891, cache_write_tokens: 0, fee: 0.0010923 };
const chatRequest = () => ({ model: 'kimi-k3', currency: 'USD', stream: true, messages: [{ role: 'system', content: 'ctx' }, { role: 'user', content: 'hi' }] });
const call = (db: any, name: string) => db.calls.find((c: any[]) => c[0] === name);

describe('recordChatUsage', () => {
    afterEach(() => { Cache.api_keys = []; });

    it('does nothing without a database or in performance mode', async () => {
        await expect(recordChatUsage({ user: key }, { chatRequest: chatRequest(), modelData: model, text: 'OK', cost })).resolves.toBeUndefined();
        const db = fakeDb();
        await recordChatUsage({ db, user: key, performanceMode: true }, { chatRequest: chatRequest(), modelData: model, text: 'OK', cost });
        expect(db.calls).toEqual([]);
    });
    it('inserts a thread with the billed fee, tokens and model id', async () => {
        const db = fakeDb();
        const req = chatRequest();
        await recordChatUsage({ db, user: key }, { chatRequest: req, modelData: model, text: 'OK', cost, first_byte_latency: 120, invocation_latency: 900 });
        expect(call(db, 'insert')[1]).toBe('eiai_thread');
        expect(call(db, 'insert')[2]).toMatchObject({
            prompt: '"hi"', completion: 'OK', whole_prompt: JSON.stringify(req.messages), key_id: 7, model_id: 5,
            tokens_in: 2916, tokens_out: 10, price_in: 3e-6, price_out: 15e-6, fee: 0.0010923, currency: 'USD',
            thread_type: 0, session_id: 0, first_byte_latency: 120, invocation_latency: 900,
        });
        expect(req.messages).toHaveLength(2);
    });
    it('adds the fee to the key with the same SQL as the other providers', async () => {
        const db = fakeDb();
        await recordChatUsage({ db, user: key }, { chatRequest: chatRequest(), modelData: model, text: 'OK', cost });
        const [, sql, params] = call(db, 'query');
        expect(sql).toBe('update eiai_key set total_fee=total_fee+$1, month_fee=$2, updated_at=$3 where id=$4 RETURNING *');
        expect(params[0]).toBe(0.0010923);
        expect(params[1]).toBeCloseTo(1.0010923, 12);
        expect(params[2]).toBeInstanceOf(Date);
        expect(params[3]).toBe(7);
    });
    it('updates the session totals when a session id is given', async () => {
        const db = fakeDb({ id: 3, total_in_tokens: 10, total_out_tokens: 5, total_fee: '0.5' });
        await recordChatUsage({ db, user: key }, { session_id: 'sess-1', chatRequest: chatRequest(), modelData: model, text: 'OK', cost });
        expect(call(db, 'save')[2]).toMatchObject({ id: 3, total_in_tokens: 2926, total_out_tokens: 15, total_fee: expect.closeTo(0.5010923, 12) });
        expect(call(db, 'insert')[2].session_id).toBe(3);
    });
    it('does nothing without an API key', async () => {
        const db = fakeDb();
        await recordChatUsage({ db }, { chatRequest: chatRequest(), modelData: model, text: 'OK', cost });
        expect(db.calls).toEqual([]);
    });
    it('creates the session on its first call', async () => {
        const db = fakeDb();
        await recordChatUsage({ db, user: key }, { session_id: 'sess-1', chatRequest: chatRequest(), modelData: model, text: 'OK', cost });
        expect(call(db, 'loadByKV').slice(1)).toEqual(['eiai_session', 'key', 'sess-1']);
        expect(call(db, 'save').slice(1)).toEqual(['eiai_session', { key: 'sess-1', key_id: 7, total_in_tokens: 2916, total_out_tokens: 10, total_fee: 0.0010923 }]);
        expect(call(db, 'insert')[2]).toMatchObject({ session_key: 'sess-1', session_id: 11 });
    });
    it('stamps the update time on an existing session', async () => {
        const db = fakeDb({ id: 3, total_in_tokens: 0, total_out_tokens: 0, total_fee: '0' });
        await recordChatUsage({ db, user: key }, { session_id: 'sess-1', chatRequest: chatRequest(), modelData: model, text: 'OK', cost });
        expect(call(db, 'save')[2].updated_at).toBeInstanceOf(Date);
    });
    it('titles the session with the first 30 characters of the reply, for non-stream requests only', async () => {
        const existing = { id: 3, total_in_tokens: 0, total_out_tokens: 0, total_fee: '0' };
        const text = 'x'.repeat(40);
        const plain = fakeDb(existing);
        await recordChatUsage({ db: plain, user: key }, { session_id: 'sess-1', chatRequest: { ...chatRequest(), stream: false }, modelData: model, text, cost });
        expect(call(plain, 'save')[2].title).toBe('x'.repeat(30));
        const streamed = fakeDb(existing);
        await recordChatUsage({ db: streamed, user: key }, { session_id: 'sess-1', chatRequest: chatRequest(), modelData: model, text, cost });
        expect(call(streamed, 'save')[2]).not.toHaveProperty('title');
    });
    it('marks the thread of a non-stream request as type 1', async () => {
        const db = fakeDb();
        await recordChatUsage({ db, user: key }, { chatRequest: { ...chatRequest(), stream: false }, modelData: model, text: 'OK', cost });
        expect(call(db, 'insert')[2].thread_type).toBe(1);
    });
    it('records the currency of the request', async () => {
        const db = fakeDb();
        await recordChatUsage({ db, user: key }, { chatRequest: { ...chatRequest(), currency: 'CNY' }, modelData: model, text: 'OK', cost });
        expect(call(db, 'insert')[2].currency).toBe('CNY');
    });
    it('stops month_fee at the monthly quota while total_fee gets the whole fee', async () => {
        const db = fakeDb();
        await recordChatUsage({ db, user: { ...key, month_fee: '9.9995' } }, { chatRequest: chatRequest(), modelData: model, text: 'OK', cost });
        const params = call(db, 'query')[2];
        expect(params[0]).toBe(0.0010923);
        expect(params[1]).toBe(10);
    });
    it('updates the cached month_fee of the key', async () => {
        Cache.api_keys = [{ id: 7, month_fee: '1' }, { id: 8, month_fee: '5' }];
        await recordChatUsage({ db: fakeDb(), user: key }, { chatRequest: chatRequest(), modelData: model, text: 'OK', cost });
        expect(Cache.api_keys[0].month_fee).toBeCloseTo(1.0010923, 12);
        expect(Cache.api_keys[1].month_fee).toBe('5');
    });
    it('leaves ctx.user as it found it', async () => {
        const user = { ...key };
        const ctx = { db: fakeDb(), user };
        await recordChatUsage(ctx, { chatRequest: chatRequest(), modelData: model, text: 'OK', cost });
        expect(ctx.user).toBe(user);
        expect(user).toEqual(key);
    });
});
