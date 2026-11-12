import { describe, expect, it } from 'vitest';
import runtimeModels from '../src/controller/runtime/models';
import createUserModelController from '../src/controller/user/ModelController';

const RT = 'bedrock-runtime-anthropic';
const groupRows = [
    { group_id: 1, group_name: 'group 1', model_id: 20, model_name: 'claude-opus-4-8', provider: RT },
    { group_id: 1, group_name: 'group 1', model_id: 21, model_name: 'claude-sonnet-5-5', provider: RT },
    { group_id: 3, group_name: 'team-b', model_id: 22, model_name: 'claude-haiku-4-5', provider: RT },
];
const keyRows = [
    { key_id: 7, model_id: 21, model_name: 'claude-sonnet-5-5', provider: RT },
    { key_id: 7, model_id: 23, model_name: 'claude-haiku-5-5', provider: RT },
    { key_id: 7, model_id: 23, model_name: 'claude-haiku-5-5', provider: RT },
    { key_id: 8, model_id: 24, model_name: 'claude-opus-5-5', provider: RT },
];

function fakeDb(key: { id: number; group_id: number | null }) {
    const rowsMatchingWhere = (table: string, c: any) => {
        const rows = table === 'eiai_v_group_model' ? groupRows : table === 'eiai_v_key_model' ? keyRows : [];
        const filters = [...String(c.where).matchAll(/(\w+)=\$(\d+)/g)].map(([, col, n]) => [col, c.params[Number(n) - 1]]);
        return rows
            .filter((row: any) => filters.every(([col, value]) => row[col] === value))
            .map((row) => ({ ...row, multiple: 1, created_at: 0, price_in: 0, price_out: 0 }));
    };
    return {
        list: async (table: string, c: any) => rowsMatchingWhere(table, c),
        count: async (table: string, c: any) => rowsMatchingWhere(table, c).length,
        loadById: async () => ({ ...key }),
    };
}

function userRoute(path: string) {
    let handler: any;
    const controller: any = createUserModelController({ get: (p: string, fn: any) => { if (p === path) handler = fn; } });
    return (ctx: any) => handler.call(controller, ctx);
}

const endpoints: Record<string, (key: { id: number; group_id: number | null }) => Promise<string[]>> = {
    'GET /v1/models': async (key) => {
        const ctx: any = { db: fakeDb(key), user: { ...key } };
        await runtimeModels.list(ctx);
        return ctx.body.data.map((m: any) => m.id);
    },
    'GET /user/model/list': async (key) => {
        const ctx: any = { db: fakeDb(key), user: { id: key.id } };
        await userRoute('/user/model/list')(ctx);
        return ctx.body.data.map((m: any) => m.name);
    },
    'GET /user/model/list-for-brclient': async (key) => {
        const ctx: any = { db: fakeDb(key), user: { ...key } };
        await userRoute('/user/model/list-for-brclient')(ctx);
        return ctx.body.data.map((m: any) => m.name);
    },
};

describe.each(Object.entries(endpoints))('%s', (_name, listedModels) => {
    it.each([0, null])('lists only the key\'s own models when group_id is %s', async (group_id) => {
        expect((await listedModels({ id: 7, group_id })).sort()).toEqual(['claude-haiku-5-5', 'claude-sonnet-5-5']);
    });

    it('lists the key\'s group models and its own, once each, and no other group\'s', async () => {
        expect((await listedModels({ id: 7, group_id: 1 })).sort())
            .toEqual(['claude-haiku-5-5', 'claude-opus-4-8', 'claude-sonnet-5-5']);
    });
});
