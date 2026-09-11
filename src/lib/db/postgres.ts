import { Pool, type PoolClient } from "pg";
import { toPositional, type Driver, type Row } from "./driver";

/**
 * Serverless functions each hold their own pool, so the cap is deliberately
 * small. Point DATABASE_URL at a pooled endpoint (Neon/Vercel Postgres hand
 * you a `-pooler` host) so many instances don't exhaust the server.
 */
const MAX_CONNECTIONS = Number(process.env.DATABASE_POOL_MAX ?? 3);

export async function createPostgresDriver(url: string): Promise<Driver> {
  const pool = new Pool({
    connectionString: url,
    max: MAX_CONNECTIONS,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    // Hosted Postgres is TLS-only, and the CA isn't in the lambda trust store.
    ssl: needsSsl(url) ? { rejectUnauthorized: false } : undefined,
  });

  function driverFor(run: (sql: string, params: unknown[]) => Promise<Row[]>): Driver {
    return {
      kind: "postgres",
      async all(sql, params = []) {
        return run(sql, params);
      },
      async get(sql, params = []) {
        return (await run(sql, params))[0];
      },
      async run(sql, params = []) {
        await run(sql, params);
      },
      async exec(sql) {
        // Postgres refuses parameters alongside multiple statements, and the
        // simple protocol handles the semicolons for us.
        await pool.query(sql);
      },
      transaction: (fn) => transaction(fn),
      async columns(table) {
        const rows = await run(
          `SELECT column_name FROM information_schema.columns WHERE table_name = ?`,
          [table],
        );
        return rows.map((r) => String(r.column_name));
      },
      async close() {
        await pool.end();
      },
    };
  }

  const viaPool = async (sql: string, params: unknown[]) =>
    (await pool.query(toPositional(sql), params as never[])).rows as Row[];

  async function transaction<T>(fn: (tx: Driver) => Promise<T>): Promise<T> {
    const client: PoolClient = await pool.connect();
    const viaClient = async (sql: string, params: unknown[]) =>
      (await client.query(toPositional(sql), params as never[])).rows as Row[];
    try {
      await client.query("BEGIN");
      const result = await fn(driverFor(viaClient));
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  return driverFor(viaPool);
}

function needsSsl(url: string): boolean {
  if (/sslmode=disable/.test(url)) return false;
  return !/localhost|127\.0\.0\.1/.test(url);
}
