import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import Cache from '../src/util/cache';

// The lark SDK is replaced, so the bot connects to nothing. A lark or axios error carries the request it failed on,
// tenant token included; each error below carries one, and none of it may reach the logs.

const lark = vi.hoisted(() => ({ handlers: {} as Record<string, (data: any) => Promise<void>>, wsError: null as Error | null }));

vi.mock('@larksuiteoapi/node-sdk', () => ({
    WSClient: class {
        constructor() {
            if (lark.wsError) throw lark.wsError;
        }
        start() {}
    },
    Client: class {},
    EventDispatcher: class {
        register(handlers: Record<string, (data: any) => Promise<void>>) {
            lark.handlers = handlers;
            return this;
        }
    },
}));

function captureOutput() {
    const lines: string[] = [];
    const sink = (...args: any[]) => { lines.push(args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')); };
    for (const m of ['log', 'info', 'debug', 'warn', 'error'] as const) vi.spyOn(console, m).mockImplementation(sink);
    return lines;
}

function larkError(): any {
    const err: any = new Error('request failed');
    err.config = { headers: { Authorization: 'Bearer SECRET-MARKER' } };
    err.response = { status: 401, config: err.config };
    return err;
}

const connector = { name: 'bot', provider: 'feishu', config: { appId: 'app-1', appSecret: 'app-secret' } };

describe('Feishu bot errors are logged as message and status only', () => {
    let saved: any[];
    beforeEach(() => {
        saved = Cache.connectors;
        lark.handlers = {};
        lark.wsError = null;
    });
    afterEach(() => {
        Cache.connectors = saved;
        vi.restoreAllMocks();
    });

    const expectMessageOnly = (lines: string[]) => {
        const out = lines.join('\n');
        expect(out).not.toContain('SECRET-MARKER');
        expect(out).toContain('request failed');
        expect(out).toContain('401');
    };

    it('a failing file download', async () => {
        const lines = captureOutput();
        const client: any = { im: { messageResource: { get: async () => { throw larkError(); } } } };
        const { handleFileContent } = await import('../src/controller/bot/Feishu');
        await expect(handleFileContent(client, 'om_1', { file_key: 'f', file_name: 'a.pdf' })).resolves.toBeUndefined();
        expectMessageOnly(lines);
    });

    it('a failing image download', async () => {
        const lines = captureOutput();
        const client: any = { im: { messageResource: { get: async () => { throw larkError(); } } } };
        const { handleImageContent } = await import('../src/controller/bot/Feishu');
        await expect(handleImageContent(client, 'om_1', 'img_1')).resolves.toBeUndefined();
        expectMessageOnly(lines);
    });

    it('a message the handler cannot process', async () => {
        Cache.connectors = [connector] as any;
        const feishu = (await import('../src/controller/bot/Feishu')).default;
        feishu({});
        await vi.waitFor(() => expect(lark.handlers['im.message.receive_v1']).toBeTypeOf('function'));
        const lines = captureOutput();
        const err = larkError();
        await lark.handlers['im.message.receive_v1']({ get sender() { throw err; } });
        expectMessageOnly(lines);
    });

    it('a bot that cannot connect', async () => {
        Cache.connectors = [] as any;
        const controller: any = (await import('../src/controller/bot/Feishu')).default({});
        Cache.connectors = [{ ...connector, name: 'bot-2', config: { appId: 'app-2', appSecret: 'app-secret' } }] as any;
        const err = larkError();
        lark.wsError = err;
        const lines = captureOutput();
        await expect(controller.routers({})).resolves.toBeUndefined();
        expectMessageOnly(lines);
    });
});
