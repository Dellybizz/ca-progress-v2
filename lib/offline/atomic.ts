import type { D1DatabaseLike } from "@/lib/data/d1/client";
type Statement = ReturnType<D1DatabaseLike["prepare"]>;

/** Collect writes, but keep validation reads on the real database. No write is
 * committed until its receipt and optimistic guard can commit in the same batch. */
export function stageOfflineWrites(real: D1DatabaseLike) {
  const writes: Statement[] = [];
  const underlying = new WeakMap<Statement, { statement: Statement; read: boolean }>();
  function wrap(sql: string, values: unknown[] = []): Statement {
    const statement = real.prepare(sql).bind(...values);
    const read = /^\s*SELECT\b/i.test(sql);
    const proxy: Statement = {
      bind: (...next) => wrap(sql, next),
      first: () => { if (!read) throw new Error("Write-returning queries are unavailable offline."); return statement.first(); },
      all: () => { if (!read) throw new Error("Write-returning queries are unavailable offline."); return statement.all(); },
      run: async () => { if (read) throw new Error("Expected a mutation."); writes.push(statement); return { success: true }; },
    };
    underlying.set(proxy, { statement, read });
    return proxy;
  }
  const db: D1DatabaseLike = {
    prepare: wrap,
    batch: async <T>(statements: Statement[]) => {
      const results = [];
      for (const proxy of statements) {
        const entry = underlying.get(proxy);
        if (!entry) throw new Error("Unscoped offline statement.");
        if (entry.read) results.push(await entry.statement.all<T>());
        else { writes.push(entry.statement); results.push({ success: true }); }
      }
      return results;
    },
  };
  return { db, writes };
}
