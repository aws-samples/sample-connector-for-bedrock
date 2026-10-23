import { describe, it, expect, afterEach, vi } from 'vitest';
import Cache from '../src/util/cache';
import { recordChatUsage } from '../src/providers/usage_recorder';
import { ADD_KEY_FEE_SQL } from '../src/providers/key_fee';
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
    it('stores an empty prompt when the request has no messages', async () => {
        const db = fakeDb();
        await recordChatUsage({ db, user: key }, { chatRequest: { ...chatRequest(), messages: [] }, modelData: model, text: 'OK', cost });
        expect(call(db, 'insert')[2]).toMatchObject({ prompt: '', whole_prompt: '[]', completion: 'OK' });
    });
    it('adds the fee to the key with the same SQL as the other providers', async () => {
        const db = fakeDb();
        await recordChatUsage({ db, user: key }, { chatRequest: chatRequest(), modelData: model, text: 'OK', cost });
        const [, sql, params] = call(db, 'query');
        expect(sql).toBe(ADD_KEY_FEE_SQL);
        expect(params).toEqual([0.0010923, expect.any(Date), 7]);
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
    // What the charge does to the stored key is tested on Postgres in balance_charging.test.ts.
    it('copies the key row the charge returns to the cached key', async () => {
        const updated_at = new Date();
        Cache.api_keys = [{ id: 7, api_key: 'k7', month_fee: '1', balance: '3', total_fee: '2' }, { id: 8, month_fee: '5' }];
        const db: any = fakeDb();
        db.query = async () => ({ rows: [{ id: 7, total_fee: '2.0010923000', month_fee: '1.0010923000', balance: '3.0000000000', updated_at }], rowCount: 1 });
        await recordChatUsage({ db, user: key }, { chatRequest: chatRequest(), modelData: model, text: 'OK', cost });
        expect(Cache.api_keys).toEqual([
            { id: 7, api_key: 'k7', total_fee: '2.0010923000', month_fee: '1.0010923000', balance: '3.0000000000', updated_at },
            { id: 8, month_fee: '5' },
        ]);
    });
    it('leaves the cache alone when no key row comes back', async () => {
        Cache.api_keys = [{ id: 7, month_fee: '1', balance: '3' }];
        await recordChatUsage({ db: fakeDb(), user: key }, { chatRequest: chatRequest(), modelData: model, text: 'OK', cost });
        expect(Cache.api_keys).toEqual([{ id: 7, month_fee: '1', balance: '3' }]);
    });
    // A session or thread row can fail on its own, for example on a session key longer than the column. The key is
    // charged first, so such a failure cannot leave month_fee unchanged and the key never blocked.
    it.each(['save', 'insert'])('charges the key even when the %s of the session or thread fails', async (method) => {
        const db: any = fakeDb();
        db[method] = async () => { throw new Error('value too long for type character varying(128)'); };
        await expect(recordChatUsage({ db, user: key, logger: { error: vi.fn() } }, { session_id: 'sess-1', chatRequest: chatRequest(), modelData: model, text: 'OK', cost }))
            .rejects.toThrow('value too long');
        const [, sql, params] = call(db, 'query');
        expect(sql).toBe(ADD_KEY_FEE_SQL);
        expect(params[0]).toBe(0.0010923);
    });
    it('logs a failed key charge and still writes the session and the thread', async () => {
        const db: any = fakeDb();
        db.query = async () => { throw new Error('deadlock detected'); };
        const logger = { error: vi.fn() };
        await recordChatUsage({ db, user: key, logger }, { session_id: 'sess-1', chatRequest: chatRequest(), modelData: model, text: 'OK', cost });
        expect(call(db, 'save')).toBeDefined();
        expect(call(db, 'insert')).toBeDefined();
        expect(JSON.stringify(logger.error.mock.calls)).toContain('deadlock detected');
    });
    it('leaves ctx.user as it found it', async () => {
        const user = { ...key };
        const ctx = { db: fakeDb(), user };
        await recordChatUsage(ctx, { chatRequest: chatRequest(), modelData: model, text: 'OK', cost });
        expect(ctx.user).toBe(user);
        expect(user).toEqual(key);
    });
});
