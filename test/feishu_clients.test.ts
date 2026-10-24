import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';

// The lark SDK is replaced; the counters show how many WebSocket clients are built, started and closed.

const lark = vi.hoisted(() => ({
    constructed: [] as any[],
    starts: 0,
    closes: [] as any[],
    failFor: new Set<string>(),
}));

vi.mock('@larksuiteoapi/node-sdk', () => ({
    WSClient: class {
        appId: string;
        constructor(cfg: any) {
            if (lark.failFor.has(cfg.appId)) {
                const err: any = new Error('cannot connect');
                err.config = { headers: { Authorization: 'Bearer SECRET-MARKER' } };
                throw err;
            }
            this.appId = cfg.appId;
            lark.constructed.push(cfg);
        }
        start() { lark.starts++; }
        close(params: any) { lark.closes.push({ appId: this.appId, params }); }
    },
    Client: class {},
    EventDispatcher: class {
        register() { return this; }
    },
}));

const conn = (name: string, over: any = {}) => ({ name, provider: 'feishu', config: { appId: `app-${name}`, appSecret: 'secret-1', ...over } });

describe('one Feishu client per connector', () => {
    let sync: (c: any[]) => Promise<void>;
    let closeAll: () => void;
    beforeEach(async () => {
        lark.constructed = [];
        lark.starts = 0;
        lark.closes = [];
        lark.failFor = new Set();
        delete process.env.FEISHU_APP_ID;
        delete process.env.FEISHU_APP_SECRET;
        vi.spyOn(console, 'log').mockImplementation(() => {});
        const mod = await import('../src/controller/bot/feishu_clients');
        sync = mod.syncFeishuClients;
        closeAll = mod.closeAllFeishuClients;
    });
    afterEach(() => {
        closeAll();
        vi.restoreAllMocks();
    });

    it('keeps one client across refreshes', async () => {
        for (let i = 0; i < 3; i++) await sync([conn('a')]);
        expect(lark.constructed.length).toBe(1);
        expect(lark.starts).toBe(1);
        expect(lark.closes.length).toBe(0);
    });

    it('replaces the client when the config changes', async () => {
        await sync([conn('a')]);
        await sync([conn('a', { appSecret: 'secret-2' })]);
        expect(lark.closes).toEqual([{ appId: 'app-a', params: { force: true } }]);
        expect(lark.constructed.length).toBe(2);
        expect(lark.starts).toBe(2);
    });

    it('replaces the client when the environment override changes', async () => {
        await sync([conn('a')]);
        process.env.FEISHU_APP_SECRET = 'other';
        await sync([conn('a')]);
        expect(lark.closes.length).toBe(1);
        expect(lark.constructed.length).toBe(2);
    });

    it('closes the client of a removed connector', async () => {
        await sync([conn('a'), conn('b')]);
        await sync([conn('a')]);
        expect(lark.closes).toEqual([{ appId: 'app-b', params: { force: true } }]);
        expect(lark.constructed.length).toBe(2);
    });

    it('a failing connector does not stop the others and nothing is thrown', async () => {
        lark.failFor.add('app-bad');
        const lines: string[] = [];
        vi.spyOn(console, 'error').mockImplementation((...a: any[]) => { lines.push(a.map(String).join(' ')); });
        await expect(sync([conn('bad'), conn('good')])).resolves.toBeUndefined();
        expect(lark.constructed.map(c => c.appId)).toEqual(['app-good']);
        expect(lark.starts).toBe(1);
        const out = lines.join('\n');
        expect(out).toContain('cannot connect');
        expect(out).not.toContain('SECRET-MARKER');
        expect(out).not.toContain('secret-1');
    });
});
