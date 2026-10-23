import { describe, expect, it } from 'vitest';
import createController from '../src/controller/user/ModelController';

// Runs GET /user/model/list against a fake db whose model rows carry credentials in `config`.
const groupRow = {
    id: 1, group_id: 2, model_id: 10, group_name: 'team-a', model_name: 'gpt-x', multiple: 1,
    price_in: 1.5, price_out: 3, provider: 'openai', config: { apiKey: 'SECRET-MARKER' },
};
const keyRow = {
    id: 2, key_id: 7, model_id: 11, key_name: 'my-key', model_name: 'claude-y', multiple: 0,
    price_in: 2, price_out: 4, provider: 'converse', config: { bearer: 'SECRET-MARKER-2' },
};

async function callList() {
    let handler: any;
    const router = { get: (path: string, fn: any) => { if (path === '/user/model/list') handler = fn; } };
    const controller: any = createController(router);
    const db = {
        loadById: async () => ({ id: 7, group_id: 2 }),
        list: async (table: string) => (table === 'eiai_v_group_model' ? [{ ...groupRow }] : [{ ...keyRow }]),
        count: async () => 1,
    };
    const ctx: any = { user: { id: 7 }, db };
    await handler.call(controller, ctx);
    return ctx.body;
}

describe('GET /user/model/list', () => {
    it('returns only public model fields', async () => {
        const body = await callList();
        const text = JSON.stringify(body);
        expect(text).not.toContain('SECRET-MARKER');
        const rows = body.data;
        expect(rows).toHaveLength(2);
        for (const row of rows) {
            expect(row).not.toHaveProperty('config');
            expect(Object.keys(row).sort()).toEqual(
                ['group_name', 'multiple', 'name', 'price_in', 'price_out', 'provider']);
        }
        expect(rows[0]).toEqual({
            name: 'gpt-x', provider: 'openai', price_in: 1.5, price_out: 3, multiple: 1, group_name: 'team-a',
        });
        expect(rows[1].name).toBe('claude-y');
    });
});
