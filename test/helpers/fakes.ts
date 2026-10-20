// Stands in for the PGClient methods the providers call. Every call is recorded as
// [methodName, ...args] in `calls`, so a test can assert on what would have been written.
export function fakeDb(session?: any) {
    const calls: any[] = [];
    const method = (name: string, reply: (...args: any[]) => any) =>
        async (...args: any[]) => {
            calls.push([name, ...args]);
            return reply(...args);
        };
    return {
        calls,
        loadByKV: method('loadByKV', () => session ?? null),
        save: method('save', (_table: string, data: any) => ({ id: data.id ?? 11 })),
        insert: method('insert', () => ({ id: 1 })),
        query: method('query', () => ({ rows: [], rowCount: 0 })),
        exists: method('exists', () => true),
    };
}

// Stands in for pg's Client against one simulated database, shared by every Client it creates.
// CREATE TABLE makes a table exist, INSERT INTO eiai_migration adds to `ledger`, and ROLLBACK
// undoes both back to BEGIN. Each query text is recorded in `queries`; a query matching `failOn`
// takes effect and then throws, as a failing statement in a multi-statement script would.
export function fakePg(opts: { tables?: string[]; failOn?: RegExp } = {}) {
    const db = { tables: new Set(opts.tables ?? []), ledger: [] as string[] };
    const queries: string[] = [];
    let saved: { tables: Set<string>; ledger: string[] } | null = null;
    const run = (text: string, params: any[]) => {
        const regclass = text.match(/^SELECT to_regclass\('public\.(\w+)'\)$/);
        if (regclass) return [{ to_regclass: db.tables.has(regclass[1]) ? regclass[1] : null }];
        if (text === 'BEGIN') saved = { tables: new Set(db.tables), ledger: [...db.ledger] };
        else if (text === 'COMMIT') saved = null;
        else if (text === 'ROLLBACK') { if (saved) Object.assign(db, saved); saved = null; }
        else if (/^SELECT name FROM eiai_migration/.test(text)) {
            if (!db.tables.has('eiai_migration')) throw new Error('relation "eiai_migration" does not exist');
            return db.ledger.map((name) => ({ name }));
        } else if (/^INSERT INTO eiai_migration/.test(text)) {
            if (db.ledger.includes(params[0])) throw new Error('duplicate key value violates unique constraint');
            db.ledger.push(params[0]);
        } else {
            for (const [, table] of text.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?(\w+)/gi)) db.tables.add(table);
        }
        return [];
    };
    class Client {
        async connect() {}
        async end() {}
        async query(text: string, params: any[] = []) {
            queries.push(text);
            const rows = run(text, params);
            if (opts.failOn?.test(text)) throw new Error('simulated failure');
            return { rows, rowCount: rows.length };
        }
    }
    return { db, queries, Client };
}
