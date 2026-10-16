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

/** Migrations first (so the first load finds its tables), then the cache, waiting at most capMs. */
export async function startUp(opts: StartUpOptions = {}): Promise<boolean> {
    const runInstall = opts.install ?? install;
    const cacheRun = opts.cacheRun ?? (() => cache.run());
    const skip = opts.skipInstall ?? config.skipDbInstall;
    if (!skip) {
        try {
            await runInstall();
        } catch (err: any) {
            console.error("❌ Database install failed, continuing startup: ", err?.message ?? err);
        }
    }
    return warmUpCache(cacheRun(), opts.capMs ?? config.cacheWarmupTimeoutMs);
}
