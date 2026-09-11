export type Row = Record<string, unknown>;

/**
 * The whole app talks to this. Queries are written once, in a portable subset
 * of SQL with `?` placeholders; each driver adapts as needed.
 */
export interface Driver {
  readonly kind: "sqlite" | "postgres";
  all(sql: string, params?: unknown[]): Promise<Row[]>;
  get(sql: string, params?: unknown[]): Promise<Row | undefined>;
  run(sql: string, params?: unknown[]): Promise<void>;
  /** Multi-statement DDL. Not parameterised. */
  exec(sql: string): Promise<void>;
  /** Runs fn against a driver bound to one connection, rolling back on throw. */
  transaction<T>(fn: (tx: Driver) => Promise<T>): Promise<T>;
  /** Column names of a table, for additive migrations. */
  columns(table: string): Promise<string[]>;
  close(): Promise<void>;
}

/**
 * `?` → `$1, $2, …` for Postgres. Quoted strings and identifiers are skipped
 * so a literal question mark inside one is left alone.
 */
export function toPositional(sql: string): string {
  let out = "";
  let index = 0;
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
    } else if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
    } else if (ch === "?" && !inSingle && !inDouble) {
      out += `$${++index}`;
      continue;
    }
    out += ch;
  }
  return out;
}
