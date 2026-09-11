import type { Driver } from "./driver";
import { ADDED_COLUMNS, SCHEMA } from "./schema";
import { createSqliteDriver } from "./sqlite";
import { createPostgresDriver } from "./postgres";

export type { Driver, Row } from "./driver";
export { localDataDir } from "./sqlite";

export type DbMode = "sqlite" | "postgres";

/** Postgres when a connection string is present, SQLite otherwise. */
export function dbMode(): DbMode {
  return databaseUrl() ? "postgres" : "sqlite";
}

function databaseUrl(): string | null {
  return (
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL ?? // what Vercel Postgres injects
    null
  );
}

declare global {
  var __rehearseDriver: Promise<Driver> | undefined;
}

/** One driver per process, migrated once. */
export function db(): Promise<Driver> {
  globalThis.__rehearseDriver ??= connect();
  return globalThis.__rehearseDriver;
}

async function connect(): Promise<Driver> {
  const url = databaseUrl();
  const driver = url
    ? await createPostgresDriver(url)
    : await createSqliteDriver();
  await migrate(driver);
  return driver;
}

async function migrate(driver: Driver) {
  await driver.exec(SCHEMA);
  for (const [table, column, ddl] of ADDED_COLUMNS) {
    const existing = await driver.columns(table);
    if (!existing.includes(column)) {
      await driver.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
    }
  }
}

export function id(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}
