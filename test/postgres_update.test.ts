import { describe, it, expect } from 'vitest';
import PGClient from '../src/util/postgres';

function recorder() {
    const calls: { sql: string; params: any[] }[] = [];
    const db = Object.assign(new PGClient(), {
        pool: { query: async (sql: string, params: any[]) => { calls.push({ sql, params }); return { rows: [{ id: 1 }], rowCount: 1 }; } },
    });
    return { db, calls };
}

describe('PGClient.update', () => {
    it('binds the id', async () => {
        const { db, calls } = recorder();
        await db.update('eiai_key', { id: 'MARKER_ID', name: 'n' });
        expect(calls[0].sql).toBe('UPDATE eiai_key SET name = $1 WHERE id = $2 RETURNING id');
        expect(calls[0].params).toEqual(['n', 'MARKER_ID']);
    });

    it('binds the id with several columns', async () => {
        const { db, calls } = recorder();
        await db.update('eiai_key', { name: 'n', id: 'MARKER_ID', role: 'r' });
        expect(calls[0].sql).toBe('UPDATE eiai_key SET (name, role) = ($1, $2) WHERE id = $3 RETURNING id');
        expect(calls[0].params).toEqual(['n', 'r', 'MARKER_ID']);
    });
});

describe('PGClient.transaction', () => {
    function pooled(failOn?: RegExp) {
        const log: string[] = [];
        let released = 0;
        const client = {
            query: async (sql: string) => {
                log.push(sql);
                if (failOn && failOn.test(sql)) throw new Error('boom');
                return { rows: [], rowCount: 0 };
            },
            release: () => { released++; },
        };
        const db = Object.assign(new PGClient(), { pool: { connect: async () => client } });
        return { db, log, released: () => released, client };
    }

    it('commits on success and releases the client', async () => {
        const { db, log, released, client } = pooled();
        const out = await db.transaction(async (tx) => {
            expect(tx.pool).toBe(client);
            await tx.query('SELECT 1', []);
            return 'ok';
        });
        expect(out).toBe('ok');
        expect(log).toEqual(['BEGIN', 'SELECT 1', 'COMMIT']);
        expect(released()).toBe(1);
    });

    it('rolls back, rethrows and releases on error', async () => {
        const { db, log, released } = pooled();
        await expect(db.transaction(async () => { throw new Error('nope'); })).rejects.toThrow('nope');
        expect(log).toEqual(['BEGIN', 'ROLLBACK']);
        expect(released()).toBe(1);
    });
});
