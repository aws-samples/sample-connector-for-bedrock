import { readFileSync } from 'fs';
import { join } from 'path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import AbstractProvider from '../src/providers/abstract_provider';
import providers from '../src/providers/provider';
import { recordChatUsage } from '../src/providers/usage_recorder';
import { ADD_KEY_FEE_SQL } from '../src/providers/key_fee';
import PGClient from '../src/util/postgres';
import Cache from '../src/util/cache';

// Both fee writers charge the key: AbstractProvider.saveThread (through updateKeyFee) for the legacy providers and
// recordChatUsage for the bedrock-runtime-* providers. Each test records the statements a writer sends and runs them
// on real Postgres (PGlite) with the eiai_key table from src/scripts/create.sql.

class TestProvider extends AbstractProvider {
    async chat() {}
}

type Writer = (db: any, key: any, fee: number) => Promise<void>;
const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };
const chatRequest = () => ({ model: 'm', currency: 'USD', stream: true, messages: [{ role: 'user', content: 'hi' }] });
const model = (fee: number) => ({ id: 7, name: 'm', provider: 'test', multiple: 0, model_type: 1, price_in: fee, price_out: 0, config: {} });

// One input token at a price of `fee` costs exactly `fee`.
const writers: [string, Writer][] = [
    ['saveThread', async (db, key, fee) => {
        const provider = new TestProvider();
        provider.setModelData(model(fee));
        provider.setKeyData(key);
        await provider.saveThread({ db, user: key, logger }, '', chatRequest(), { text: 'ok', input_tokens: 1, output_tokens: 0 } as any);
    }],
    ['recordChatUsage', async (db, key, fee) => {
        await recordChatUsage({ db, user: key, logger }, {
            chatRequest: chatRequest(), modelData: model(fee) as any, text: 'ok',
            cost: { tokens_in: 1, tokens_out: 0, cached_tokens: 0, cache_write_tokens: 0, fee },
        });
    }],
];

let pg: PGlite;
let statements: { sql: string; params: any[] }[] = [];
const run = async (text: string, params: any[] = []) => {
    statements.push({ sql: text, params });
    const r = await pg.query(text, params);
    return { rows: r.rows as any[], rowCount: r.affectedRows ?? r.rows.length };
};
// The app's PG client with PGlite in place of the pg pool.
const appDb = () => Object.assign(new PGClient(), { pool: { query: run } });
const keyWrites = () => statements.filter((s) => /^\s*update\s+eiai_key\b/i.test(s.sql));

let keys = 0;
// Inserts a key and returns its row as the cache holds it.
async function newKey(k: { month_fee: number; balance: number; month_quota?: number; updated_at?: Date }) {
    const { rows } = await pg.query<any>(
        'INSERT INTO eiai_key (api_key, name, total_fee, month_fee, month_quota, balance, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
        [`br-${++keys}`, `k${keys}`, 2, k.month_fee, k.month_quota ?? 10, k.balance, k.updated_at ?? new Date()],
    );
    return rows[0];
}
async function stored(id: number) {
    const { rows } = await pg.query<any>('SELECT total_fee, month_fee, balance, updated_at FROM eiai_key WHERE id = $1', [id]);
    const r = rows[0];
    return { total_fee: Number(r.total_fee), month_fee: Number(r.month_fee), balance: Number(r.balance), updated_at: r.updated_at };
}

beforeAll(async () => {
    pg = await PGlite.create();
    await pg.exec(readFileSync(join(__dirname, '../src/scripts/create.sql'), 'utf8'));
}, 30000);
afterAll(async () => { await pg?.close(); });
beforeEach(() => { statements = []; });
afterEach(() => {
    vi.useRealTimers();
    Cache.api_keys = [];
});

describe.each(writers)('%s charges the key', (_name, write) => {
    it('under the monthly quota: month_fee grows and the balance is unchanged', async () => {
        const key = await newKey({ month_fee: 1, balance: 5 });
        await write(appDb(), key, 0.5);
        expect(await stored(key.id)).toMatchObject({ total_fee: 2.5, month_fee: 1.5, balance: 5 });
    });

    it('crossing the quota by 0.3: month_fee stops at the quota and the balance falls by 0.3', async () => {
        const key = await newKey({ month_fee: 9.8, balance: 5 });
        await write(appDb(), key, 0.5);
        expect(await stored(key.id)).toMatchObject({ total_fee: 2.5, month_fee: 10, balance: 4.7 });
    });

    it('already over the quota: the balance falls by the whole fee', async () => {
        const key = await newKey({ month_fee: 10, balance: 5 });
        await write(appDb(), key, 0.5);
        expect(await stored(key.id)).toMatchObject({ total_fee: 2.5, month_fee: 10, balance: 4.5 });
    });

    it('a key with no monthly quota pays every call from the balance', async () => {
        const key = await newKey({ month_fee: 0, month_quota: 0, balance: 5 });
        await write(appDb(), key, 0.5);
        expect(await stored(key.id)).toMatchObject({ total_fee: 2.5, month_fee: 0, balance: 4.5 });
    });

    // The admin can lower month_quota below the month_fee already spent. The call then costs the balance its own
    // fee, not also the difference.
    it('a quota lowered below month_fee: the balance falls by the fee only', async () => {
        const key = await newKey({ month_fee: 8, month_quota: 5, balance: 5 });
        await write(appDb(), key, 0.5);
        expect(await stored(key.id)).toMatchObject({ total_fee: 2.5, month_fee: 5, balance: 4.5 });
    });

    it('the call that uses up the balance may take it below zero; the next call is then refused', async () => {
        const key = await newKey({ month_fee: 10, balance: 0.2 });
        Cache.api_keys = [key];
        await expect(providers.checkFee({ db: appDb(), user: key }, key)).resolves.toBeUndefined();
        await write(appDb(), key, 0.5);
        expect(await stored(key.id)).toMatchObject({ total_fee: 2.5, month_fee: 10, balance: -0.3 });
        // The gate reads the cached key.
        expect(Number(Cache.api_keys[0].balance)).toBe(-0.3);
        await expect(providers.checkFee({ db: appDb(), user: Cache.api_keys[0] }, Cache.api_keys[0])).rejects.toThrow('Please recharge.');
    });

    it('two calls that finish at the same time over the quota: the balance falls by the sum of both overflows', async () => {
        const key = await newKey({ month_fee: 9.8, balance: 5 });
        // Both calls passed the gate with the same cached key.
        await Promise.all([write(appDb(), key, 0.5), write(appDb(), key, 0.5)]);
        expect(await stored(key.id)).toMatchObject({ total_fee: 3, month_fee: 10, balance: 4.2 });
    });

    describe('in a new month', () => {
        const now = new Date('2026-11-15T12:00:00Z');
        beforeEach(() => {
            vi.useFakeTimers({ toFake: ['Date'] });
            vi.setSystemTime(now);
        });

        it.each([
            ['last month', new Date('2026-10-15T12:00:00Z')],
            ['the same month a year ago', new Date('2025-11-20T12:00:00Z')],
        ])('month_fee from %s restarts at 0 before the fee applies', async (_when, updated_at) => {
            const key = await newKey({ month_fee: 10, balance: 5, updated_at });
            await write(appDb(), key, 0.5);
            const after = await stored(key.id);
            expect(after).toMatchObject({ total_fee: 2.5, month_fee: 0.5, balance: 5 });
            // The time of the call, as Postgres stores it.
            const { rows } = await pg.query<any>('SELECT $1::timestamp AS t', [now]);
            expect(after.updated_at).toEqual(rows[0].t);
        });

        it('the reset applies once: the next call of the month adds to month_fee', async () => {
            const key = await newKey({ month_fee: 9.8, balance: 5, updated_at: new Date('2026-10-15T12:00:00Z') });
            await Promise.all([write(appDb(), key, 0.6), write(appDb(), key, 0.6)]);
            expect(await stored(key.id)).toMatchObject({ total_fee: 3.2, month_fee: 1.2, balance: 5 });
        });

        it('month_fee from earlier in the same month is kept', async () => {
            const key = await newKey({ month_fee: 10, balance: 5, updated_at: new Date('2026-11-02T12:00:00Z') });
            await write(appDb(), key, 0.5);
            expect(await stored(key.id)).toMatchObject({ total_fee: 2.5, month_fee: 10, balance: 4.5 });
        });
    });
});

describe('the key charge', () => {
    const call = async (write: Writer, key: any, fee: number) => {
        statements = [];
        await write(appDb(), key, fee);
        return keyWrites();
    };

    it('is one statement with the fee, the time and the key id, the same for both writers', async () => {
        const key = await newKey({ month_fee: 1, balance: 5 });
        const [legacy, runtime] = [await call(writers[0][1], key, 0.5), await call(writers[1][1], key, 0.25)];
        expect(legacy).toHaveLength(1);
        expect(runtime).toHaveLength(1);
        expect(legacy[0].sql).toBe(ADD_KEY_FEE_SQL);
        expect(runtime[0].sql).toBe(ADD_KEY_FEE_SQL);
        for (const [s, fee] of [[legacy[0], 0.5], [runtime[0], 0.25]] as const) {
            expect(s.params).toHaveLength(3);
            expect(s.params[0]).toBe(fee);
            expect(s.params[1]).toBeInstanceOf(Date);
            expect(s.params[2]).toBe(key.id);
        }
        // Computed from the stored row, not from the key the request read.
        expect(legacy[0].sql).toMatch(/\bbalance\s*=\s*balance\s*-/i);
        expect(legacy[0].sql).toMatch(/\bmonth_fee\s*=\s*least\(/i);
    });

    it('loses no update when both writers charge one key at the same time', async () => {
        const key = await newKey({ month_fee: 9.5, balance: 5 });
        await Promise.all(Array.from({ length: 20 }, (_, i) => writers[i % 2][1](appDb(), key, 0.1)));
        const after = await stored(key.id);
        expect(after.total_fee).toBeCloseTo(4, 10);
        expect(after.month_fee).toBe(10);
        expect(after.balance).toBeCloseTo(3.5, 10);
    });

    it.each(writers)('from %s writes the stored month_fee, balance and update time to the cached key', async (_name, write) => {
        const key = await newKey({ month_fee: 9.8, balance: 5 });
        const other = await newKey({ month_fee: 1, balance: 1 });
        Cache.api_keys = [{ ...other }, { ...key }];
        await write(appDb(), key, 0.5);
        const after = await stored(key.id);
        const cached = Cache.api_keys[1];
        expect(Number(cached.month_fee)).toBe(10);
        expect(Number(cached.balance)).toBe(4.7);
        expect(Number(cached.total_fee)).toBe(2.5);
        expect(new Date(cached.updated_at).getTime()).toBe(after.updated_at.getTime());
        expect(Cache.api_keys[0]).toEqual(other);
    });

    // The fee check resets month_fee when the cached key was last charged in an earlier month. The charge stamps
    // the cached key with the stored update time, so the check does not reset month_fee again later in the month.
    it.each(writers)('from %s lets the fee check reset month_fee once in a new month', async (_name, write) => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-10-15T12:00:00Z'));
        const key = await newKey({ month_fee: 10, balance: 5 });
        Cache.api_keys = [key];
        vi.setSystemTime(new Date('2026-11-15T12:00:00Z'));
        for (let i = 0; i < 2; i++) {
            const cached = Cache.api_keys[0];
            await providers.checkFee({ db: appDb(), user: cached }, cached);
            await write(appDb(), cached, 0.5);
        }
        expect(await stored(key.id)).toMatchObject({ total_fee: 3, month_fee: 1, balance: 5 });
    });

    it('from saveThread charges each call of a provider instance to the key', async () => {
        const key = await newKey({ month_fee: 10, balance: 5 });
        const provider = new TestProvider();
        provider.setModelData(model(0.5));
        provider.setKeyData(key);
        const ctx = { db: appDb(), user: key, logger };
        for (let i = 0; i < 2; i++) {
            await provider.saveThread(ctx, '', chatRequest(), { text: 'ok', input_tokens: 1, output_tokens: 0 } as any);
        }
        expect(await stored(key.id)).toMatchObject({ total_fee: 3, month_fee: 10, balance: 4 });
        expect(ctx.user).toBe(key);
    });
});
