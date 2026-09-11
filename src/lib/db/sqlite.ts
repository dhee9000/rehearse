import fs from "node:fs";
import path from "node:path";
import type { Driver, Row } from "./driver";

/** Where the SQLite file and, in filesystem mode, the audio live. */
export function localDataDir(): string {
  const fallback = process.env.VERCEL ? "/tmp/rehearse" : "data";
  const configured = process.env.DATA_DIR ?? fallback;
  return path.isAbsolute(configured)
    ? configured
    : path.join(/* turbopackIgnore: true */ process.cwd(), configured);
}

type Handle = {
  prepare(sql: string): {
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown;
    run(...params: unknown[]): unknown;
  };
  exec(sql: string): void;
  close(): void;
};

export async function createSqliteDriver(): Promise<Driver> {
  // Imported lazily so a Postgres-only deployment never loads node:sqlite.
  const { DatabaseSync } = await import("node:sqlite");
  const dir = localDataDir();
  fs.mkdirSync(dir, { recursive: true });

  const handle = new DatabaseSync(path.join(dir, "rehearse.db")) as Handle;
  handle.exec("PRAGMA journal_mode = WAL;");
  handle.exec("PRAGMA foreign_keys = ON;");

  const driver: Driver = {
    kind: "sqlite",
    async all(sql, params = []) {
      return handle.prepare(sql).all(...params) as Row[];
    },
    async get(sql, params = []) {
      return handle.prepare(sql).get(...params) as Row | undefined;
    },
    async run(sql, params = []) {
      handle.prepare(sql).run(...params);
    },
    async exec(sql) {
      handle.exec(sql);
    },
    async transaction(fn) {
      handle.exec("BEGIN");
      try {
        const result = await fn(driver);
        handle.exec("COMMIT");
        return result;
      } catch (err) {
        handle.exec("ROLLBACK");
        throw err;
      }
    },
    async columns(table) {
      const rows = handle.prepare(`PRAGMA table_info(${table})`).all() as {
        name: string;
      }[];
      return rows.map((r) => r.name);
    },
    async close() {
      handle.close();
    },
  };
  return driver;
}
