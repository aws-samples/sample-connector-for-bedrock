import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs, { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { fakePg } from './helpers/fakes';

const scripts = join(__dirname, '../src/scripts');
const read = (file: string) => readFileSync(join(scripts, file), 'utf8');
const migrationDir = join(scripts, 'migrations');
const migrations = existsSync(migrationDir) ? readdirSync(migrationDir).filter((f) => f.endsWith('.sql')).sort() : [];
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
});

describe('runMigrations', () => {
    let dir: string;
    beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'brc-migrations-')); });
    afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

    it('apply pending files in lexical filename order and skip recorded ones', async () => {
        const names = ['2.sql', 'notes.txt', '10.sql', '1.sql', '0.sql'];
        for (const n of names) writeFileSync(join(dir, n), `CREATE TABLE t${n.split('.')[0]} (id int);`);
        // The filesystem decides the listing order, so hand it over unsorted.
        vi.spyOn(fs, 'readdirSync').mockReturnValueOnce(names as any);
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
        expect(fake.queries.slice(-2)).toEqual(['CREATE TABLE t2 (id int); SELECT boom;', 'ROLLBACK']);
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
});
