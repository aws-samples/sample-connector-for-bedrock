import { describe, expect, it } from 'vitest';
import { hasRuntimeAnthropicModel } from '../src/claude_code_web/access';

// Fake db over a binding table: evaluates list() and exists() the way the SQL filters would.
type Row = { key_id?: number; group_id?: number; provider: string };
function fakeDb(keyRows: Row[], groupRows: Row[]) {
    const calls: any[] = [];
    const run = (table: string, c: any) => {
        calls.push([table, c.where, c.params]);
        const rows = table === 'eiai_v_key_model' ? keyRows : groupRows;
        // Only the shapes the access check may use: "<col>=$1 and provider=$2" or the list form.
        const w: string = c.where || '';
        return rows.filter((r: any) => {
            const col = table === 'eiai_v_key_model' ? 'key_id' : 'group_id';
            const hasCol = w.includes(`${col}=$1`);
            const idOk = hasCol ? r[col] === c.params[0] : true; // a missing filter returns every row, like the real list()
            const prov = w.includes('provider=$2') ? r.provider === c.params[1] : true;
            return idOk && prov;
        });
    };
    return {
        calls,
        exists: async (t: string, c: any) => run(t, c).length > 0,
        list: async (t: string, c: any) => run(t, c),
        count: async (t: string, c: any) => run(t, c).length,
    };
}
const RT = 'bedrock-runtime-anthropic';

describe('hasRuntimeAnthropicModel', () => {
    it('is true for a key-level binding', async () => {
        const db = fakeDb([{ key_id: 7, provider: RT }], []);
        expect(await hasRuntimeAnthropicModel(db, { id: 7, group_id: 0 })).toBe(true);
    });
    it('is true for a group-level binding', async () => {
        const db = fakeDb([], [{ group_id: 3, provider: RT }]);
        expect(await hasRuntimeAnthropicModel(db, { id: 7, group_id: 3 })).toBe(true);
    });
    it('is false for group_id 0 even when another group has a binding', async () => {
        const db = fakeDb([], [{ group_id: 1, provider: RT }]);
        expect(await hasRuntimeAnthropicModel(db, { id: 7, group_id: 0 })).toBe(false);
    });
    it('is false for group_id null even when another group has a binding', async () => {
        const db = fakeDb([], [{ group_id: 1, provider: RT }]);
        expect(await hasRuntimeAnthropicModel(db, { id: 7, group_id: null })).toBe(false);
    });
    it('is false when the bindings are other providers only', async () => {
        const db = fakeDb([{ key_id: 7, provider: 'bedrock' }], [{ group_id: 3, provider: 'openai' }]);
        expect(await hasRuntimeAnthropicModel(db, { id: 7, group_id: 3 })).toBe(false);
    });
    it('filters by provider in SQL and ignores other keys and groups', async () => {
        const db = fakeDb([{ key_id: 8, provider: RT }], [{ group_id: 4, provider: RT }]);
        expect(await hasRuntimeAnthropicModel(db, { id: 7, group_id: 3 })).toBe(false);
        expect(db.calls.every((c) => c[1].includes('provider=$2'))).toBe(true);
    });
});
