import { describe, it, expect, vi, beforeAll, beforeEach, afterAll, afterEach } from 'vitest';
import fs, { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { PGlite } from '@electric-sql/pglite';
import { fakePg } from './helpers/fakes';

const scripts = join(__dirname, '../src/scripts');
const read = (file: string) => readFileSync(join(scripts, file), 'utf8');
const migrationDir = join(scripts, 'migrations');
const migrations = readdirSync(migrationDir).filter((f) => f.endsWith('.sql')).sort();
const migrationSql = migrations.map((f) => read(join('migrations', f)));
const patchSql = ['create.sql', 'patch-0.0.5.sql', 'patch-0.0.12.sql'].map(read);
// The tables install checks for; with all of them present, create.sql and both patches are skipped.
const PATCHED_TABLES = ['eiai_key', 'eiai_model', 'eiai_group', 'eiai_group_model', 'eiai_bot_connector'];

let error: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    error = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.resetModules(); vi.doUnmock('pg'); });

async function loadInstall(fake: ReturnType<typeof fakePg>, env: Record<string, string> = {}) {
    vi.resetModules();
    for (const [k, v] of Object.entries({ PGSQL_HOST: 'h', PGSQL_DATABASE: 'd', SKIP_DB_INSTALL: '', ADMIN_API_KEY: 'k', ...env })) vi.stubEnv(k, v);
    vi.doMock('pg', () => ({ Client: fake.Client }));
    return import('../src/install');
}

describe('install migrations', () => {
    it('ship the preset-model migration', () => {
        expect(migrations).toContain('2026-10-20-preset-models.sql');
        expect(migrations).toContain('2026-10-20b-claude-chat-presets.sql');
    });

    it('Claude 5.5 chat presets are bedrock-converse models priced like the runtime-anthropic ones', () => {
        const chat = read('migrations/2026-10-20b-claude-chat-presets.sql');
        const base = read('migrations/2026-10-20-preset-models.sql');
        const expected: Record<string, string[]> = { opus: ['4e-6', '20e-6'], sonnet: ['2e-6', '10e-6'], haiku: ['0.1e-6', '0.5e-6'] };
        for (const m of ['opus', 'sonnet', 'haiku']) {
            const id = `global.anthropic.claude-${m}-5-5`;
            const row = chat.split('\n').find((l) => l.startsWith(`('claude-${m}-5-5-chat'`));
            expect(row).toContain(`'bedrock-converse', '{"modelId": "${id}"}'`);
            const prices = (l: string) => l.match(/\}', ([^,]+), ([^)]+)\)/)?.slice(1, 3);
            const src = base.split('\n').find((l) => l.startsWith(`('claude-${m}-5-5'`));
            expect(prices(row!)).toEqual(prices(src!));
            expect(prices(row!)).toEqual(expected[m]);
        }
        expect(chat).toContain('WHERE EXISTS (SELECT 1 FROM eiai_group WHERE id = 1)');
    });

    it('fresh database runs the patches, then each migration once in a transaction, and records it', async () => {
        const fake = fakePg();
        await (await loadInstall(fake)).default();
        const at = (sql: string) => fake.queries.indexOf(sql);
        const order = [...patchSql, ...migrationSql].map(at);
        expect(order.every((i) => i >= 0)).toBe(true);
        expect([...order].sort((a, b) => a - b)).toEqual(order);
        for (const sql of migrationSql) {
            expect(fake.queries.filter((q) => q === sql)).toHaveLength(1);
            expect(fake.queries[at(sql) - 1]).toBe('BEGIN');
            expect(fake.queries.slice(at(sql) + 1, at(sql) + 3)).toEqual(['INSERT INTO eiai_migration (name) VALUES ($1)', 'COMMIT']);
        }
        expect(fake.db.ledger).toEqual(migrations);
    });

    it('existing database without the ledger runs only the ledger and the migrations', async () => {
        const fake = fakePg({ tables: PATCHED_TABLES });
        await (await loadInstall(fake)).default();
        for (const sql of patchSql) expect(fake.queries).not.toContain(sql);
        expect(fake.queries).toContain('CREATE TABLE IF NOT EXISTS eiai_migration (name varchar(128) PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
        for (const sql of migrationSql) expect(fake.queries).toContain(sql);
        expect(fake.db.ledger).toEqual(migrations);
    });

    it('second startup applies nothing', async () => {
        const fake = fakePg();
        await (await loadInstall(fake)).default();
        const first = fake.queries.length;
        await (await loadInstall(fake)).default();
        const second = fake.queries.slice(first);
        for (const sql of [...patchSql, ...migrationSql]) expect(second).not.toContain(sql);
        expect(second).not.toContain('BEGIN');
        expect(fake.db.ledger).toEqual(migrations);
    });

    it('SKIP_DB_INSTALL runs nothing', async () => {
        const fake = fakePg();
        await (await loadInstall(fake, { SKIP_DB_INSTALL: 'true' })).default();
        expect(fake.queries).toEqual([]);
    });

    it('install takes the migration lock before it checks for tables', async () => {
        const fake = fakePg();
        await (await loadInstall(fake)).default();
        const q = fake.queries;
        expect(q.indexOf('select pg_advisory_lock(727463001)')).toBeGreaterThanOrEqual(0);
        expect(q.indexOf('select pg_advisory_lock(727463001)')).toBeLessThan(q.indexOf("SELECT to_regclass('public.eiai_key')"));
        expect(q[q.length - 1]).toBe('select pg_advisory_unlock(727463001)');
        expect(q.filter((x) => x === 'select pg_advisory_lock(727463001)').length)
            .toBe(q.filter((x) => x === 'select pg_advisory_unlock(727463001)').length);
    });

    it('a create.sql failure still releases the lock and ends the client', async () => {
        const fake = fakePg({ failOn: /CREATE TABLE IF NOT EXISTS eiai_key \(/ });
        const end = vi.spyOn(fake.Client.prototype, 'end');
        await expect((await loadInstall(fake)).default()).rejects.toThrow('simulated failure');
        const q = fake.queries;
        expect(q).toContain(patchSql[0]);
        expect(q[q.length - 1]).toBe('select pg_advisory_unlock(727463001)');
        expect(q.filter((x) => /pg_advisory_lock\(/.test(x))).toHaveLength(1);
        expect(q.filter((x) => /pg_advisory_unlock\(/.test(x))).toHaveLength(1);
        expect(end).toHaveBeenCalled();
    });
});

describe('runMigrations', () => {
    let dir: string;
    beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'brc-migrations-')); });
    afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

    it('apply pending files in lexical filename order and skip recorded ones', async () => {
        const names = ['2.sql', 'notes.txt', '10.sql', '1.sql', '0.sql'];
        for (const n of names) writeFileSync(join(dir, n), `CREATE TABLE t${n.split('.')[0]} (id int);`);
        // The filesystem decides the listing order, so hand it over unsorted.
        const real = fs.readdirSync;
        vi.spyOn(fs, 'readdirSync').mockImplementation(((p: any, ...a: any[]) => (p === dir ? names : (real as any)(p, ...a))) as any);
        const fake = fakePg({ tables: ['eiai_migration'] });
        fake.db.ledger.push('0.sql');
        const { runMigrations } = await loadInstall(fake);
        await runMigrations(new fake.Client() as any, dir);
        expect(fake.db.ledger).toEqual(['0.sql', '1.sql', '10.sql', '2.sql']);
        expect(fake.queries.filter((q) => q.startsWith('CREATE TABLE t'))).toEqual(['CREATE TABLE t1 (id int);', 'CREATE TABLE t10 (id int);', 'CREATE TABLE t2 (id int);']);
    });

    it('a failing migration is rolled back and not recorded, and later ones are not attempted', async () => {
        writeFileSync(join(dir, '1.sql'), 'CREATE TABLE t1 (id int);');
        writeFileSync(join(dir, '2.sql'), 'CREATE TABLE t2 (id int); SELECT boom;');
        writeFileSync(join(dir, '3.sql'), 'CREATE TABLE t3 (id int);');
        const fake = fakePg({ failOn: /boom/ });
        const { runMigrations } = await loadInstall(fake);
        await expect(runMigrations(new fake.Client() as any, dir)).resolves.toBeUndefined();
        expect(fake.db.ledger).toEqual(['1.sql']);
        expect([...fake.db.tables].sort()).toEqual(['eiai_migration', 't1']);
        expect(fake.queries.slice(-3, -1)).toEqual(['CREATE TABLE t2 (id int); SELECT boom;', 'ROLLBACK']);
        expect(fake.queries).not.toContain('CREATE TABLE t3 (id int);');
        expect(error.mock.calls.join('\n')).toMatch(/2\.sql.*simulated failure/s);
    });

    it('a failing migration does not stop install from finishing', async () => {
        const fake = fakePg({ tables: PATCHED_TABLES, failOn: /INSERT INTO eiai_model/ });
        const end = vi.spyOn(fake.Client.prototype, 'end');
        await expect((await loadInstall(fake)).default()).resolves.toBeUndefined();
        expect(fake.db.ledger).toEqual([]);
        expect(end).toHaveBeenCalled();
        expect(error.mock.calls.join('\n')).toMatch(/2026-10-20-preset-models\.sql/);
    });

    it('takes the advisory lock before the first ledger statement and releases it after the last', async () => {
        writeFileSync(join(dir, '1.sql'), 'CREATE TABLE t1 (id int);');
        const fake = fakePg();
        const { runMigrations } = await loadInstall(fake);
        await runMigrations(new fake.Client() as any, dir);
        const q = fake.queries;
        expect(q[0]).toMatch(/^select pg_advisory_lock\(\d+\)$/);
        expect(q[q.length - 1]).toMatch(/^select pg_advisory_unlock\(\d+\)$/);
        expect(q[q.length - 1].match(/\d+/)![0]).toBe(q[0].match(/\d+/)![0]);
        expect(q.indexOf("SELECT to_regclass('public.eiai_migration')")).toBe(1);
        expect(q.filter((x) => /pg_advisory/.test(x))).toHaveLength(2);
    });

    it('releases the lock when a migration fails', async () => {
        writeFileSync(join(dir, '1.sql'), 'SELECT boom;');
        const fake = fakePg({ failOn: /boom/ });
        const { runMigrations } = await loadInstall(fake);
        await runMigrations(new fake.Client() as any, dir);
        expect(fake.queries[fake.queries.length - 1]).toMatch(/^select pg_advisory_unlock\(/);
    });

    it('an existing ledger table skips the CREATE', async () => {
        const fake = fakePg({ tables: ['eiai_migration'] });
        const { runMigrations } = await loadInstall(fake);
        await runMigrations(new fake.Client() as any, dir);
        expect(fake.queries.filter((q) => /CREATE TABLE/i.test(q))).toEqual([]);
    });

    it('a CREATE failure is logged, does not throw, and install still ends the client', async () => {
        const fake = fakePg({ tables: PATCHED_TABLES, failOn: /CREATE TABLE IF NOT EXISTS eiai_migration/ });
        const end = vi.spyOn(fake.Client.prototype, 'end');
        await expect((await loadInstall(fake)).default()).resolves.toBeUndefined();
        expect(end).toHaveBeenCalled();
        expect(error.mock.calls.join('\n')).toMatch(/❌ \[migration\].*simulated failure/s);
        expect(fake.queries[fake.queries.length - 1]).toMatch(/pg_advisory_unlock/);
    });

    it('an unreadable migrations directory is logged, not thrown', async () => {
        const fake = fakePg({ tables: ['eiai_migration'] });
        const { runMigrations } = await loadInstall(fake);
        await expect(runMigrations(new fake.Client() as any, join(dir, 'missing'))).resolves.toBeUndefined();
        expect(error.mock.calls.join('\n')).toMatch(/❌ \[migration\]/);
    });
});

describe('the converse cache-price migration', () => {
    const NAME = '2026-10-23-converse-cache-prices.sql';
    const sql = migrations.includes(NAME) ? read(join('migrations', NAME)) : '';
    // Bedrock's global cross-Region prices for Claude 5.5 (us-east-1): a cache read is 0.05 of the input price for
    // Opus and Sonnet and 0.1 for Haiku; a 5-minute cache write is 1.25 of it.
    const PRESETS: Record<string, { read: number; write: number }> = {
        'claude-opus-5-5-chat': { read: 0.05, write: 1.25 },
        'claude-sonnet-5-5-chat': { read: 0.05, write: 1.25 },
        'claude-haiku-5-5-chat': { read: 0.1, write: 1.25 },
    };

    let db: PGlite;
    let queries: string[] = [];
    // pg's Client.query on PGlite: parameterised statements go through query(), scripts through exec().
    const run = async (text: string, params?: any[]) => {
        queries.push(text);
        if (params?.length) {
            const r = await db.query(text, params);
            return { rows: r.rows as any[], rowCount: r.affectedRows ?? r.rows.length };
        }
        const results = await db.exec(text);
        const last = results[results.length - 1];
        return { rows: (last?.rows ?? []) as any[], rowCount: last?.affectedRows ?? 0 };
    };
    // The real src/install.ts against PGlite. withMigration=false is the install from before this migration.
    const install = async (withMigration: boolean) => {
        vi.resetModules();
        for (const [k, v] of Object.entries({ PGSQL_HOST: 'h', PGSQL_DATABASE: 'd', SKIP_DB_INSTALL: '', ADMIN_API_KEY: 'k' })) vi.stubEnv(k, v);
        vi.doMock('pg', () => ({ Client: class { async connect() {} async end() {} query(text: string, params?: any[]) { return run(text, params); } } }));
        const real = fs.readdirSync;
        const hide = withMigration ? null : vi.spyOn(fs, 'readdirSync').mockImplementation(((p: any, ...a: any[]) => {
            const listed = (real as any)(p, ...a);
            return resolve(String(p)) === resolve(migrationDir) ? listed.filter((f: string) => f !== NAME) : listed;
        }) as any);
        const start = queries.length;
        try {
            await (await import('../src/install')).default();
        } finally {
            hide?.mockRestore();
            vi.doUnmock('pg');
        }
        return queries.slice(start);
    };
    const reset = () => db.exec('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    const models = async () => (await db.query<any>('SELECT id, name, provider, config, price_in, price_out FROM eiai_model ORDER BY id')).rows;
    const model = async (name: string) => (await models()).find((m) => m.name === name);
    const ledger = async () => (await db.query<any>('SELECT name FROM eiai_migration ORDER BY name')).rows.map((r) => r.name);

    beforeAll(async () => { db = await PGlite.create(); }, 30000);
    afterAll(async () => { await db?.close(); });

    it('is a plain script', () => {
        expect(migrations).toContain(NAME);
        expect(sql).not.toMatch(/\b(BEGIN|COMMIT|ROLLBACK|CONCURRENTLY|DELETE|INSERT)\b/i);
    });

    it('a fresh install gets per-token cache prices for the three presets, from their own price_in', async () => {
        await reset();
        await install(true);
        for (const [name, ratio] of Object.entries(PRESETS)) {
            const m = await model(name);
            expect(m.provider, name).toBe('bedrock-converse');
            expect(m.config.price_cache_read, name).toBeCloseTo(Number(m.price_in) * ratio.read, 15);
            expect(m.config.price_cache_write, name).toBeCloseTo(Number(m.price_in) * ratio.write, 15);
            // The same cache prices as the matching bedrock-runtime-anthropic preset.
            const runtime = await model(name.replace(/-chat$/, ''));
            expect(m.config.price_cache_read, name).toBeCloseTo(runtime.config.price_cache_read, 15);
            expect(m.config.price_cache_write, name).toBeCloseTo(runtime.config.price_cache_write, 15);
        }
        expect((await model('claude-sonnet-5-5-chat')).config).toEqual({ modelId: 'global.anthropic.claude-sonnet-5-5', price_cache_read: 0.0000001, price_cache_write: 0.0000025 });
        expect(await ledger()).toContain(NAME);
    }, 30000);

    it('an existing database keeps the cache prices an admin set, and changes no other model', async () => {
        await reset();
        await install(false);
        await db.exec(`
            UPDATE eiai_model SET config = config || '{"price_cache_read": 0.123e-6}' WHERE name = 'claude-sonnet-5-5-chat';
            UPDATE eiai_model SET config = config || '{"price_cache_write": 0}' WHERE name = 'claude-haiku-5-5-chat';
            UPDATE eiai_model SET price_in = 5e-6 WHERE name = 'claude-opus-5-5-chat';
            INSERT INTO eiai_model (name, multiple, provider, config, price_in, price_out) VALUES
                ('my-converse', 1, 'bedrock-converse', '{"modelId": "amazon.nova-micro-v1:0"}', 0.035e-6, 0.14e-6),
                ('claude-x-5-5-chat', 1, 'bedrock-converse', '{"modelId": "global.anthropic.claude-sonnet-5-5"}', 2e-6, 10e-6);
        `);
        const before = await models();
        expect(await ledger()).not.toContain(NAME);

        const sent = await install(true);
        const after = await models();
        const at = sent.indexOf(sql);
        expect(sent.slice(at - 1, at + 3)).toEqual(['BEGIN', sql, 'INSERT INTO eiai_migration (name) VALUES ($1)', 'COMMIT']);
        expect(await ledger()).toContain(NAME);

        const sonnet = await model('claude-sonnet-5-5-chat');
        expect(sonnet.config.price_cache_read).toBe(0.000000123);
        expect(sonnet.config.price_cache_write).toBeCloseTo(2.5e-6, 15);
        const haiku = await model('claude-haiku-5-5-chat');
        expect(haiku.config.price_cache_write).toBe(0);
        expect(haiku.config.price_cache_read).toBeCloseTo(0.01e-6, 15);
        const opus = await model('claude-opus-5-5-chat');
        expect(opus.config.price_cache_read).toBeCloseTo(0.25e-6, 15);
        expect(opus.config.price_cache_write).toBeCloseTo(6.25e-6, 15);
        // Every other model, and every other column, is as it was.
        const rest = (rows: any[]) => rows.filter((m) => !(m.name in PRESETS));
        expect(rest(after)).toEqual(rest(before));
        const withoutConfig = (rows: any[]) => rows.map(({ config, ...m }) => m);
        expect(withoutConfig(after)).toEqual(withoutConfig(before));
    }, 30000);

    it('running it twice is a no-op', async () => {
        await reset();
        await install(true);
        const once = await models();
        // A second start applies nothing.
        const again = await install(true);
        expect(again).toContain('SELECT name FROM eiai_migration');
        expect(again).not.toContain('BEGIN');
        expect(again).not.toContain(sql);
        expect(await models()).toEqual(once);
        // The script itself changes nothing a second time.
        await db.exec(sql);
        expect(await models()).toEqual(once);
    }, 30000);
});
