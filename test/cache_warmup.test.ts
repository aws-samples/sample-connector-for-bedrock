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
        vi.stubEnv('CACHE_WARMUP_TIMEOUT_MS', undefined as any);
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
        expect(warm).toBe('warm');
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
        expect(await startUp({ install: async () => { throw new Error('bad migration'); }, cacheRun, skipInstall: false })).toBe('warm');
        expect(cacheRun).toHaveBeenCalled();
        err.mockRestore();
    });
});

describe('startUp budget', () => {
    const never = () => new Promise<never>(() => {});
    it('resolves within the cap when install never settles, and reports install outstanding', async () => {
        const { startUp } = await import('../src/util/warmup');
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const cacheRun = vi.fn(() => Promise.resolve(true));
        const t = Date.now();
        expect(await startUp({ install: never, cacheRun, skipInstall: false, capMs: 30 })).toBe('cold');
        expect(Date.now() - t).toBeLessThan(1000);
        expect(warn.mock.calls.join('\n')).toMatch(/install was still running/);
        warn.mockRestore();
    });
    it('resolves within the cap when the cache load never settles, and reports cache outstanding', async () => {
        const { startUp } = await import('../src/util/warmup');
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const t = Date.now();
        expect(await startUp({ install: async () => {}, cacheRun: () => never(), skipInstall: false, capMs: 30 })).toBe('cold');
        expect(Date.now() - t).toBeLessThan(1000);
        const out = warn.mock.calls.join('\n');
        expect(out).toMatch(/first cache load was still running/);
        expect(out).not.toMatch(/install was still running/);
        warn.mockRestore();
    });
    it('a cap of 0 does not wait for an unsettled install', async () => {
        const { startUp } = await import('../src/util/warmup');
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        expect(await startUp({ install: never, cacheRun: () => null, skipInstall: false, capMs: 0 })).toBe('no-database');
        warn.mockRestore();
    });
});

describe('startUp with a stalled install', () => {
    const never = () => new Promise<never>(() => {});
    it('still starts the cache exactly once when the cap fires with install outstanding', async () => {
        const { startUp } = await import('../src/util/warmup');
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const cacheRun = vi.fn(() => Promise.resolve(true));
        await startUp({ install: never, cacheRun, skipInstall: false, capMs: 20 });
        expect(cacheRun).toHaveBeenCalledTimes(1);
        warn.mockRestore();
    });
    it('never starts the cache twice when install settles after the cap', async () => {
        const { startUp } = await import('../src/util/warmup');
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        let settle!: () => void;
        const install = () => new Promise<void>((r) => { settle = r; });
        const cacheRun = vi.fn(() => Promise.resolve(true));
        await startUp({ install, cacheRun, skipInstall: false, capMs: 20 });
        settle();
        await new Promise((r) => setTimeout(r, 20));
        expect(cacheRun).toHaveBeenCalledTimes(1);
        warn.mockRestore();
    });
    it('reports no-database when there is nothing to load', async () => {
        const { startUp } = await import('../src/util/warmup');
        expect(await startUp({ install: async () => {}, cacheRun: () => null, skipInstall: false, capMs: 20 })).toBe('no-database');
    });
    it('a cap of 0 does not print the budget warning', async () => {
        const { startUp } = await import('../src/util/warmup');
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        await startUp({ install: never, cacheRun: () => null, skipInstall: false, capMs: 0 });
        expect(warn).not.toHaveBeenCalled();
        warn.mockRestore();
    });
    it('the defaults are the real install and cache.run', async () => {
        vi.resetModules();
        const installSpy = vi.fn(async () => {});
        vi.doMock('../src/install', () => ({ default: installSpy }));
        const cacheMod = (await import('../src/util/cache')).default;
        const runSpy = vi.spyOn(cacheMod, 'run').mockReturnValue(null);
        const { startUp } = await import('../src/util/warmup');
        await startUp({ capMs: 0, skipInstall: false });
        expect(installSpy).toHaveBeenCalledTimes(1);
        expect(runSpy).toHaveBeenCalledTimes(1);
        vi.doUnmock('../src/install');
    });
});

describe('CACHE_WARMUP_TIMEOUT_MS parsing', () => {
    const cap = async (v: string | undefined) => {
        vi.resetModules();
        vi.stubEnv('CACHE_WARMUP_TIMEOUT_MS', v as any);
        return (await import('../src/config')).default.cacheWarmupTimeoutMs;
    };
    it('0 is used as given', async () => { expect(await cap('0')).toBe(0); });
    it('"2500" gives 2500', async () => { expect(await cap('2500')).toBe(2500); });
    it('"abc", "" and unset give 1500', async () => {
        expect(await cap('abc')).toBe(1500);
        expect(await cap('')).toBe(1500);
        expect(await cap(undefined)).toBe(1500);
    });
    it('negative means do not wait', async () => { expect(await cap('-5')).toBe(0); });
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
        expect(log.mock.calls.join('\n')).toMatch(/SKIP_DB_INSTALL/);
        expect(ctor).not.toHaveBeenCalled();
        expect(connect).not.toHaveBeenCalled();
        log.mockRestore();
    });
});
