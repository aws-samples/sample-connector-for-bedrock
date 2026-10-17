import config from '../config';
import install from '../install';
import cache from './cache';

/** Resolves true only if `first` resolves true within `capMs`. Never rejects, leaves no timer. */
export async function warmUpCache(first: Promise<boolean> | null, capMs: number): Promise<boolean> {
    if (!first) return false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cap = new Promise<boolean>((resolve) => { timer = setTimeout(() => resolve(false), capMs); });
    try {
        return await Promise.race([first.catch(() => false), cap]);
    } finally {
        if (timer) clearTimeout(timer);
    }
}

export interface StartUpOptions {
    install?: () => Promise<unknown>;
    cacheRun?: () => Promise<boolean> | null;
    skipInstall?: boolean;
    capMs?: number;
}

export type StartUpResult = 'warm' | 'cold' | 'no-database';

/**
 * Migrations first (so the first load finds its tables), then the cache. One budget (capMs) covers
 * both steps; whatever is unfinished when it fires is abandoned and startup proceeds. If install is
 * still outstanding when the cap fires, the cache is started anyway (once), so its first load and
 * its 60 s refresh are never starved by a stalled install.
 */
export async function startUp(opts: StartUpOptions = {}): Promise<StartUpResult> {
    const runInstall = opts.install ?? install;
    const cacheRun = opts.cacheRun ?? (() => cache.run());
    const skip = opts.skipInstall ?? config.skipDbInstall;
    const capMs = opts.capMs ?? config.cacheWarmupTimeoutMs;
    let stage = 'install' as 'install' | 'cache' | 'done'; // cast: assigned inside the closure below
    let cacheStarted = false;
    let noDatabase = false;
    const startCache = (): Promise<boolean> | null => {
        cacheStarted = true;
        const first = cacheRun();
        if (!first) noDatabase = true;
        return first;
    };
    const sequence = (async (): Promise<boolean> => {
        if (!skip) {
            try {
                await runInstall();
            } catch (err: any) {
                console.error("❌ Database install failed, continuing startup: ", err?.message ?? err);
            }
        }
        if (cacheStarted) { stage = 'done'; return false; } // the cap already started it
        stage = 'cache';
        const first = startCache();
        if (!first) { stage = 'done'; return false; }
        const ok = await first.catch(() => false);
        stage = 'done';
        return ok;
    })();
    const warm = await warmUpCache(sequence, capMs);
    if (stage === 'install' && !cacheStarted) {
        // Install is stalled: start the cache anyway. A failed load on a fresh database is non-fatal
        // (logged, retried by the interval).
        if (capMs > 0) console.warn("⏱ Startup budget exhausted while database install was still running; starting the cache load anyway and listening.");
        startCache();
    } else if (stage === 'cache' && capMs > 0) {
        console.warn("⏱ Startup budget exhausted while the first cache load was still running; listening anyway.");
    }
    return noDatabase ? 'no-database' : warm ? 'warm' : 'cold';
}
