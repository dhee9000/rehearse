import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

/* Serverless hosts mount the deployment read-only; /tmp is the only writable
   path, and it is per-instance and wiped between cold starts. That makes the
   SQLite file and the rendered audio non-durable there — see README. */
const DEFAULT_DATA_DIR = process.env.VERCEL ? "/tmp/rehearse" : "data";
const configured = process.env.DATA_DIR ?? DEFAULT_DATA_DIR;

// Runtime-only path: the build tracer can't resolve it, and shouldn't try.
export const DATA_DIR = path.isAbsolute(configured)
  ? configured
  : path.join(/* turbopackIgnore: true */ process.cwd(), configured);
export const AUDIO_DIR = path.join(DATA_DIR, "audio");

const SCHEMA = `
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS scripts (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  source_name  TEXT NOT NULL,
  source_kind  TEXT NOT NULL,
  raw_text     TEXT NOT NULL,
  parse_status TEXT NOT NULL DEFAULT 'pending',
  parse_error  TEXT,
  created_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS characters (
  id          TEXT PRIMARY KEY,
  script_id   TEXT NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  ord         INTEGER NOT NULL,
  line_count  INTEGER NOT NULL DEFAULT 0,
  description TEXT
);
CREATE INDEX IF NOT EXISTS characters_script ON characters(script_id);

CREATE TABLE IF NOT EXISTS turns (
  id             TEXT PRIMARY KEY,
  script_id      TEXT NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
  idx            INTEGER NOT NULL,
  kind           TEXT NOT NULL,
  character_id   TEXT REFERENCES characters(id) ON DELETE SET NULL,
  parenthetical  TEXT,
  text           TEXT NOT NULL,
  tts_text       TEXT,
  tts_text_tagged TEXT,
  delivery       TEXT
);
CREATE INDEX IF NOT EXISTS turns_script ON turns(script_id, idx);

CREATE TABLE IF NOT EXISTS sessions (
  id                TEXT PRIMARY KEY,
  script_id         TEXT NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
  user_character_id TEXT,
  mode              TEXT NOT NULL DEFAULT 'manual',
  silence_ms        INTEGER NOT NULL DEFAULT 1200,
  mic_threshold     REAL NOT NULL DEFAULT 0.045,
  direction_ms      INTEGER NOT NULL DEFAULT 1800,
  current_idx       INTEGER NOT NULL DEFAULT 0,
  created_at        INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS session_voices (
  session_id   TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  voice_id     TEXT NOT NULL,
  PRIMARY KEY (session_id, character_id)
);

CREATE TABLE IF NOT EXISTS clips (
  id         TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  turn_id    TEXT NOT NULL REFERENCES turns(id) ON DELETE CASCADE,
  voice_id   TEXT NOT NULL,
  status     TEXT NOT NULL,
  file       TEXT,
  error      TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE (session_id, turn_id)
);
`;

declare global {
  var __rehearseDb: DatabaseSync | undefined;
}

export function db(): DatabaseSync {
  if (globalThis.__rehearseDb) return globalThis.__rehearseDb;

  fs.mkdirSync(AUDIO_DIR, { recursive: true });
  const handle = new DatabaseSync(path.join(DATA_DIR, "rehearse.db"));
  handle.exec("PRAGMA foreign_keys = ON;");
  handle.exec(SCHEMA);
  migrate(handle);
  globalThis.__rehearseDb = handle;
  return handle;
}

/** CREATE TABLE IF NOT EXISTS won't add columns to a database that already
 *  exists, so new settings have to be backfilled by hand. */
function migrate(handle: DatabaseSync) {
  const added = [
    ["sessions", "mic_threshold", "mic_threshold REAL NOT NULL DEFAULT 0.045"],
    ["sessions", "direction_ms", "direction_ms INTEGER NOT NULL DEFAULT 1800"],
  ] as const;

  for (const [table, column, ddl] of added) {
    const columns = handle.prepare(`PRAGMA table_info(${table})`).all() as {
      name: string;
    }[];
    if (!columns.some((c) => c.name === column)) {
      handle.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
    }
  }
}

export function id(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}
