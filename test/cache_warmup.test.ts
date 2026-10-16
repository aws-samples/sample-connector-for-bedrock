import { describe, it, expect, vi, afterEach } from 'vitest';

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); vi.doUnmock('../src/util/postgres'); vi.doUnmock('pg'); });

async function loadCache(env: Record<string, string>, list: (t: string) => Promise<any>) {
    vi.resetModules();
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
    vi.doMock('../src/util/postgres', () => ({ default: { build: () => ({ list }) } }));
    return (await import('../src/util/cache')).default;
}
const DB_ENV = { PGSQL_HOST: 'h', PGSQL_DATABASE: 'd' };

describe('cache.run', () => {
    it('run returns null when no database is configured', async () => {
        vi.resetModules();
        vi.stubEnv('PGSQL_HOST', '');
        vi.stubEnv('PGSQL_DATABASE', '');
        const cache = (await import('../src/util/cache')).default;
        expect(cache.run()).toBeNull();
    });
    it('run resolves true when the first load succeeds', async () => {
        vi.useFakeTimers();
        try {
            const cache = await loadCache(DB_ENV, async () => [{ id: 1 }]);
            expect(await cache.run()).toBe(true);
            expect(cache.models).toEqual([{ id: 1 }]);
        } finally { vi.clearAllTimers(); vi.useRealTimers(); }
    });
    it('run resolves false when the first load fails', async () => {
        const unhandled = vi.fn();
        process.on('unhandledRejection', unhandled);
        const si = vi.spyOn(globalThis, 'setInterval').mockImplementation((() => 0) as any);
        try {
            const cache = await loadCache(DB_ENV, async () => { throw new Error('db down'); });
            expect(await cache.run()).toBe(false);
            await new Promise((r) => setImmediate(r));
            expect(unhandled).not.toHaveBeenCalled();
        } finally { process.off('unhandledRejection', unhandled); si.mockRestore(); }
    });
});

describe('warmUpCache', () => {
    it('warmUpCache resolves true when the load wins the race', async () => {
        const { warmUpCache } = await import('../src/util/warmup');
        expect(await warmUpCache(Promise.resolve(true), 1000)).toBe(true);
    });
    it('warmUpCache gives up after the cap', async () => {
        const { warmUpCache } = await import('../src/util/warmup');
        expect(await warmUpCache(new Promise<boolean>(() => {}), 20)).toBe(false);
    });
    it('warmUpCache resolves false without a database', async () => {
        const { warmUpCache } = await import('../src/util/warmup');
        expect(await warmUpCache(null, 1000)).toBe(false);
    });
    it('warmUpCache resolves false when the load fails', async () => {
        const { warmUpCache } = await import('../src/util/warmup');
        expect(await warmUpCache(Promise.resolve(false), 1000)).toBe(false);
        expect(await warmUpCache(Promise.reject(new Error('x')), 1000)).toBe(false);
    });
    it('warmUpCache leaves no pending timer', async () => {
        const { warmUpCache } = await import('../src/util/warmup');
        vi.useFakeTimers();
        try {
            await warmUpCache(Promise.resolve(true), 1000);
            expect(vi.getTimerCount()).toBe(0);
        } finally { vi.useRealTimers(); }
    });
});

describe('startUp', () => {
    it('the default cap is 1500ms', async () => {
        vi.resetModules();
        const config = (await import('../src/config')).default;
        expect(config.cacheWarmupTimeoutMs).toBe(1500);
    });
    it('startUp runs install before the first cache load', async () => {
        const { startUp } = await import('../src/util/warmup');
        const order: string[] = [];
        const warm = await startUp({
            install: async () => { order.push('install'); },
            cacheRun: () => { order.push('cacheRun'); return Promise.resolve(true); },
            skipInstall: false,
        });
        expect(order).toEqual(['install', 'cacheRun']);
        expect(warm).toBe(true);
    });
    it('startUp skips install when skipDbInstall is set, and still loads the cache', async () => {
        const { startUp } = await import('../src/util/warmup');
        const order: string[] = [];
        await startUp({
            install: async () => { order.push('install'); },
            cacheRun: () => { order.push('cacheRun'); return null; },
            skipInstall: true,
        });
        expect(order).toEqual(['cacheRun']);
    });
    it('startUp skips install by default when SKIP_DB_INSTALL is set', async () => {
        vi.resetModules();
        vi.stubEnv('SKIP_DB_INSTALL', 'true');
        const { startUp } = await import('../src/util/warmup');
        const install = vi.fn(async () => {});
        await startUp({ install, cacheRun: () => null });
        expect(install).not.toHaveBeenCalled();
    });
    it('startUp continues when install rejects', async () => {
        const { startUp } = await import('../src/util/warmup');
        const err = vi.spyOn(console, 'error').mockImplementation(() => {});
        const cacheRun = vi.fn(() => Promise.resolve(true));
        expect(await startUp({ install: async () => { throw new Error('bad migration'); }, cacheRun, skipInstall: false })).toBe(true);
        expect(cacheRun).toHaveBeenCalled();
        err.mockRestore();
    });
});

describe('install', () => {
    it('install does nothing when SKIP_DB_INSTALL is set', async () => {
        vi.resetModules();
        vi.stubEnv('SKIP_DB_INSTALL', '1');
        vi.stubEnv('PGSQL_HOST', 'h');
        vi.stubEnv('PGSQL_DATABASE', 'd');
        const connect = vi.fn(async () => { throw new Error('must not connect'); });
        const ctor = vi.fn();
        vi.doMock('pg', () => ({ Client: class { constructor() { ctor(); } connect = connect; } }));
        const log = vi.spyOn(console, 'log').mockImplementation(() => {});
        const install = (await import('../src/install')).default;
        await expect(install()).resolves.toBeUndefined();
        expect(ctor).not.toHaveBeenCalled();
        expect(connect).not.toHaveBeenCalled();
        log.mockRestore();
    });
});
