import { describe, it, expect } from 'vitest';
import vm from 'node:vm';
import autoLoginHandler from '../src/middleware/portal_for_brclient';

// /portal-for-brclient.html is a page whose inline script writes BRClient's 'access-control' settings to
// localStorage and then sends the browser to BRClient. These tests run that script in a sandbox with a fake
// localStorage, location and fetch, and check what it stores and where it navigates.

async function portalScript(): Promise<string> {
    const ctx: any = { path: '/portal-for-brclient.html' };
    await autoLoginHandler(ctx, async () => {});
    const match = /<script>([\s\S]*?)<\/script>/.exec(ctx.body);
    if (!match) throw new Error('portal page has no script');
    return match[1];
}

type Lookup = { sharedKey: string } | 'none' | 'network-error';

async function runPortal(opts: { stored?: any; lookup: Lookup }) {
    const store = new Map<string, string>();
    if (opts.stored) store.set('access-control', JSON.stringify(opts.stored));

    let navigatedTo!: (href: string) => void;
    const navigation = new Promise<string>((resolve) => (navigatedTo = resolve));
    const location = {
        protocol: 'https:',
        host: 'brc.example.com',
        get href() { return 'https://brc.example.com/portal-for-brclient.html'; },
        set href(value: string) { navigatedTo(value); },
    };
    const fetch = async () => {
        if (opts.lookup === 'network-error') throw new Error('offline');
        if (opts.lookup === 'none') return { status: 404, json: async () => { throw new Error('not json'); } };
        return { status: 200, json: async () => ({ success: true, data: (opts.lookup as any).sharedKey }) };
    };
    const sandbox = {
        window: { location },
        localStorage: {
            getItem: (k: string) => store.get(k) ?? null,
            setItem: (k: string, v: string) => store.set(k, String(v)),
        },
        fetch,
        document: { body: {} },
        console: { error: () => {} },
    };
    vm.runInNewContext(await portalScript(), sandbox);
    const href = await navigation;
    const saved = store.get('access-control');
    return { href, state: saved ? JSON.parse(saved).state : undefined };
}

describe('portal-for-brclient.html', () => {
    it('turns on BRConnector mode and opens settings when there is no API key yet', async () => {
        const { href, state } = await runPortal({ lookup: 'none' });
        expect(state.BRProxyUrl).toBe('https://brc.example.com');
        expect(state.useBRProxy).toBe('True');
        expect(href).toBe('/brclient/#/settings');
    });

    it('keeps an API key the user saved before and opens the chat', async () => {
        const stored = { state: { openaiApiKey: 'saved-by-user', useBRProxy: 'False', awsRegion: 'us-east-1' }, version: 2 };
        const { href, state } = await runPortal({ stored, lookup: 'none' });
        expect(state.openaiApiKey).toBe('saved-by-user');
        expect(state.useBRProxy).toBe('True');
        expect(state.awsRegion).toBe('us-east-1');
        expect(href).toBe('/brclient/');
    });

    it('uses the shared key when the server has one and opens the chat', async () => {
        const { href, state } = await runPortal({ lookup: { sharedKey: 'shared-key' } });
        expect(state.openaiApiKey).toBe('shared-key');
        expect(state.useBRProxy).toBe('True');
        expect(state.BRProxyUrl).toBe('https://brc.example.com');
        expect(href).toBe('/brclient/');
    });

    it('still turns on BRConnector mode and opens settings when the shared-key lookup fails', async () => {
        const { href, state } = await runPortal({ lookup: 'network-error' });
        expect(state.BRProxyUrl).toBe('https://brc.example.com');
        expect(state.useBRProxy).toBe('True');
        expect(href).toBe('/brclient/#/settings');
    });
});
