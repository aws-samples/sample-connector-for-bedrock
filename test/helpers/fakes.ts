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
