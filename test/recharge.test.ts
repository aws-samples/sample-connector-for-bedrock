import { readFileSync } from 'fs';
import { join } from 'path';
import { PGlite } from '@electric-sql/pglite';
import { prepareValue } from 'pg/lib/utils';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import PGClient from '../src/util/postgres';
import keyService from '../src/service/key';

// Runs recharge on real Postgres (PGlite) with the tables from src/scripts/create.sql.

let pg: PGlite;
let failKeyUpdate = false;
const run = async (text: string, params: any[] = []) => {
    if (failKeyUpdate && /^\s*update\s+eiai_key\b/i.test(text)) throw new Error('update failed');
    const r = await pg.query(text, params.map(prepareValue));
    return { rows: r.rows as any[], rowCount: r.affectedRows ?? r.rows.length };
};
const appDb = () => Object.assign(new PGClient(), {
    pool: { query: run, connect: async () => ({ query: run, release: () => {} }) },
});

let n = 0;
async function newKey(balance = 1) {
    const { rows } = await pg.query<any>(
        'INSERT INTO eiai_key (api_key, name, balance) VALUES ($1, $2, $3) RETURNING *',
        [`rc-${++n}`, `rc${n}`, balance],
    );
    return rows[0];
}
const payments = async (id: number) =>
    Number((await pg.query<any>('SELECT count(*) AS c FROM eiai_payment WHERE key_id = $1', [id])).rows[0].c);
const balance = async (id: number) =>
    Number((await pg.query<any>('SELECT balance FROM eiai_key WHERE id = $1', [id])).rows[0].balance);

beforeAll(async () => {
    pg = await PGlite.create();
    await pg.exec(readFileSync(join(__dirname, '../src/scripts/create.sql'), 'utf8'));
}, 30000);
afterAll(async () => { await pg?.close(); });

describe('recharge', () => {
    it('a recharge of 10.5 writes the payment and the balance', async () => {
        const key = await newKey(1);
        await keyService.recharge(appDb(), { id: key.id, balance: 10.5 });
        expect(await payments(key.id)).toBe(1);
        expect(await balance(key.id)).toBe(11.5);
    });

    it('rejects 10.005 with 400 and writes nothing', async () => {
        const key = await newKey(1);
        await expect(keyService.recharge(appDb(), { id: key.id, balance: 10.005 }))
            .rejects.toMatchObject({ message: 'balance must have at most 2 decimal places' });
        expect(await payments(key.id)).toBe(0);
        expect(await balance(key.id)).toBe(1);
    });

    it('a failing balance update leaves no payment row', async () => {
        const key = await newKey(1);
        failKeyUpdate = true;
        try {
            await expect(keyService.recharge(appDb(), { id: key.id, balance: 5 })).rejects.toThrow('update failed');
        } finally {
            failKeyUpdate = false;
        }
        expect(await payments(key.id)).toBe(0);
        expect(await balance(key.id)).toBe(1);
    });
});
