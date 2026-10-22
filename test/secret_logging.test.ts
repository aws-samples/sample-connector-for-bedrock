import { describe, it, expect, afterEach, vi } from 'vitest';
import { createRequire } from 'node:module';
import botConnector from '../src/service/bot_connector';
import PGClient from '../src/util/postgres';
import helper from '../src/util/helper';
import { fakeDb } from './helpers/fakes';

const nodeRequire = createRequire(import.meta.url);
const nodeCrypto = nodeRequire('crypto');

function captureOutput() {
    const lines: string[] = [];
    const sink = (...args: any[]) => { lines.push(args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')); };
    for (const m of ['log', 'info', 'debug', 'warn', 'error'] as const) vi.spyOn(console, m).mockImplementation(sink);
    return lines;
}

describe('credentials stay out of logs', () => {
    afterEach(() => { vi.restoreAllMocks(); });

    it('creating a bot connector does not print its secrets', async () => {
        const lines = captureOutput();
        const db = fakeDb();
        db.exists = async () => false;
        await botConnector.save(db, { name: 'bot', provider: 'feishu', config: { appId: 'app-1', appSecret: 'SECRET-MARKER', apiKey: 'KEY-MARKER' } });
        const out = lines.join('\n');
        expect(out).not.toContain('SECRET-MARKER');
        expect(out).not.toContain('KEY-MARKER');
        expect(db.calls.find((c: any[]) => c[0] === 'insert')[2].config.appSecret).toBe('SECRET-MARKER');
    });

    it('debug SQL logging prints the parameter count, not the values', async () => {
        const lines = captureOutput();
        const client = new PGClient();
        client.debug = true;
        client.pool = { totalCount: 1, idleCount: 1, waitingCount: 0, query: async () => ({ rows: [], rowCount: 0 }) };
        await client.query('select * from eiai_key where key=$1 and id=$2', ['br-PARAM-MARKER', 7]);
        const out = lines.join('\n');
        expect(out).toContain('select * from eiai_key');
        expect(out).not.toContain('PARAM-MARKER');
        expect(out).toMatch(/params: 2\b/);
    });
});

describe('genApiKey', () => {
    afterEach(() => { vi.restoreAllMocks(); });

    it('has the br- prefix, 29 alphanumeric characters and is unique', () => {
        const keys = new Set<string>();
        for (let i = 0; i < 1000; i++) {
            const k = helper.genApiKey();
            expect(k).toMatch(/^br-[A-Za-z0-9]{29}$/);
            keys.add(k);
        }
        expect(keys.size).toBe(1000);
    });

    it('draws from crypto.randomBytes and not Math.random', () => {
        const rb = vi.spyOn(nodeCrypto, 'randomBytes');
        const mr = vi.spyOn(Math, 'random');
        helper.genApiKey();
        expect(rb).toHaveBeenCalled();
        expect(mr).not.toHaveBeenCalled();
    });
});
