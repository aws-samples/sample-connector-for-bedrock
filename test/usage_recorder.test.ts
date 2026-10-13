import { describe, it, expect } from 'vitest';
import { recordChatUsage } from '../src/providers/usage_recorder';
import { fakeDb } from './helpers/fakes';

const model = { id: 5, name: 'kimi-k3', provider: 'bedrock-runtime-openai', multiple: 1, model_type: 1, price_in: 3e-6, price_out: 15e-6, config: {} };
const key = { id: 7, month_fee: '1', month_quota: '10', balance: '0', total_fee: '2' };
const cost = { tokens_in: 2916, tokens_out: 10, cached_tokens: 2891, cache_write_tokens: 0, fee: 0.0010923 };
const chatRequest = () => ({ model: 'kimi-k3', currency: 'USD', stream: true, messages: [{ role: 'system', content: 'ctx' }, { role: 'user', content: 'hi' }] });
const call = (db: any, name: string) => db.calls.find((c: any[]) => c[0] === name);

describe('recordChatUsage', () => {
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
});
