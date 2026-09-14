/**
 * One schema for both engines. Type names are chosen to be valid in each:
 * BIGINT because a millisecond epoch overflows Postgres INTEGER, and DOUBLE
 * PRECISION so the mic threshold keeps its precision. SQLite treats both as
 * ordinary integer/real affinities.
 */
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS scripts (
  id           TEXT PRIMARY KEY,
  user_id      TEXT,
  title        TEXT NOT NULL,
  source_name  TEXT NOT NULL,
  source_kind  TEXT NOT NULL,
  raw_text     TEXT NOT NULL,
  parse_status TEXT NOT NULL DEFAULT 'pending',
  parse_error  TEXT,
  created_at   BIGINT NOT NULL
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
  id              TEXT PRIMARY KEY,
  script_id       TEXT NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
  idx             INTEGER NOT NULL,
  kind            TEXT NOT NULL,
  character_id    TEXT REFERENCES characters(id) ON DELETE SET NULL,
  parenthetical   TEXT,
  text            TEXT NOT NULL,
  tts_text        TEXT,
  tts_text_tagged TEXT,
  delivery        TEXT
);

CREATE INDEX IF NOT EXISTS turns_script ON turns(script_id, idx);

CREATE TABLE IF NOT EXISTS sessions (
  id                TEXT PRIMARY KEY,
  script_id         TEXT NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
  user_character_id TEXT,
  mode              TEXT NOT NULL DEFAULT 'manual',
  silence_ms        INTEGER NOT NULL DEFAULT 1200,
  mic_threshold     DOUBLE PRECISION NOT NULL DEFAULT 0.045,
  direction_ms      INTEGER NOT NULL DEFAULT 1800,
  current_idx       INTEGER NOT NULL DEFAULT 0,
  created_at        BIGINT NOT NULL
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
  url        TEXT,
  error      TEXT,
  created_at BIGINT NOT NULL,
  UNIQUE (session_id, turn_id)
);
`;

/**
 * Columns added after the first release. CREATE TABLE IF NOT EXISTS won't add
 * them to a database that already exists, so they're backfilled by hand.
 * `ALTER TABLE … ADD COLUMN … NOT NULL DEFAULT …` is valid in both engines.
 */
export const ADDED_COLUMNS: ReadonlyArray<
  readonly [table: string, column: string, ddl: string]
> = [
  ["sessions", "mic_threshold", "mic_threshold DOUBLE PRECISION NOT NULL DEFAULT 0.045"],
  ["sessions", "direction_ms", "direction_ms INTEGER NOT NULL DEFAULT 1800"],
  ["clips", "url", "url TEXT"],
  // Everything else hangs off a script, so ownership is recorded once here.
  // Rows predating auth keep NULL and belong to nobody — deliberately, since
  // handing them to whoever signs in first would be the wrong default.
  ["scripts", "user_id", "user_id TEXT"],
];
