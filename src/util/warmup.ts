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
    } catch {
        return false;
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

/**
 * Migrations first (so the first load finds its tables), then the cache. One budget (capMs) covers
 * both steps; whatever is unfinished when it fires is abandoned and startup proceeds.
 */
export async function startUp(opts: StartUpOptions = {}): Promise<boolean> {
    const runInstall = opts.install ?? install;
    const cacheRun = opts.cacheRun ?? (() => cache.run());
    const skip = opts.skipInstall ?? config.skipDbInstall;
    let stage: 'install' | 'cache' | 'done' = 'install';
    const sequence = (async (): Promise<boolean> => {
        if (!skip) {
            try {
                await runInstall();
            } catch (err: any) {
                console.error("❌ Database install failed, continuing startup: ", err?.message ?? err);
            }
        }
        stage = 'cache';
        const first = cacheRun();
        if (!first) { stage = 'done'; return false; }
        const ok = await first.catch(() => false);
        stage = 'done';
        return ok;
    })();
    const warm = await warmUpCache(sequence, opts.capMs ?? config.cacheWarmupTimeoutMs);
    if (stage === 'install') {
        console.warn("⏱ Startup budget exhausted while database install was still running; listening anyway.");
    } else if (stage === 'cache') {
        console.warn("⏱ Startup budget exhausted while the first cache load was still running; listening anyway.");
    }
    return warm;
}
