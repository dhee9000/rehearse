import { db, id } from "./db";
import type {
  Character,
  ClipState,
  DialogueMode,
  ScriptBundle,
  SessionBundle,
  Turn,
  TurnKind,
} from "./types";
import type { ParsedScript } from "./parse";
import { defaultVoiceFor } from "./voices";
import { clampThreshold, DEFAULT_THRESHOLD } from "./mic";
import { clampDirectionMs, DEFAULT_DIRECTION_MS } from "./pacing";

type Row = Record<string, unknown>;

const str = (v: unknown) => (v == null ? null : String(v));
const num = (v: unknown) => Number(v ?? 0);

export function createScript(input: {
  title: string;
  sourceName: string;
  sourceKind: string;
  rawText: string;
}): string {
  const scriptId = id("scr");
  db()
    .prepare(
      `INSERT INTO scripts (id, title, source_name, source_kind, raw_text, parse_status, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
    )
    .run(
      scriptId,
      input.title,
      input.sourceName,
      input.sourceKind,
      input.rawText,
      Date.now(),
    );
  return scriptId;
}

export function getRawText(scriptId: string): string | null {
  const row = db()
    .prepare(`SELECT raw_text FROM scripts WHERE id = ?`)
    .get(scriptId) as Row | undefined;
  return row ? String(row.raw_text) : null;
}

export function setParseStatus(
  scriptId: string,
  status: "pending" | "parsing" | "ready" | "failed",
  error?: string | null,
) {
  db()
    .prepare(`UPDATE scripts SET parse_status = ?, parse_error = ? WHERE id = ?`)
    .run(status, error ?? null, scriptId);
}

export function saveBreakdown(scriptId: string, parsed: ParsedScript) {
  const handle = db();
  handle.exec("BEGIN");
  try {
    handle.prepare(`DELETE FROM turns WHERE script_id = ?`).run(scriptId);
    handle.prepare(`DELETE FROM characters WHERE script_id = ?`).run(scriptId);

    const byName = new Map<string, string>();
    const counts = new Map<string, number>();
    for (const turn of parsed.turns) {
      if (turn.kind === "dialogue" && turn.character) {
        const key = turn.character.trim().toUpperCase();
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }

    // Order parts by how much they carry — the actor's own part is usually at the top.
    const ordered = [...parsed.characters]
      .map((c) => ({ ...c, key: c.name.trim().toUpperCase() }))
      .filter((c) => c.key.length > 0)
      .sort((a, b) => (counts.get(b.key) ?? 0) - (counts.get(a.key) ?? 0));

    const insertChar = handle.prepare(
      `INSERT INTO characters (id, script_id, name, ord, line_count, description)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    ordered.forEach((c, i) => {
      const charId = id("chr");
      byName.set(c.key, charId);
      insertChar.run(
        charId,
        scriptId,
        c.key,
        i,
        counts.get(c.key) ?? 0,
        c.description ?? null,
      );
    });

    const insertTurn = handle.prepare(
      `INSERT INTO turns (id, script_id, idx, kind, character_id, parenthetical, text, tts_text, tts_text_tagged, delivery)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    parsed.turns.forEach((turn, i) => {
      const key = turn.character?.trim().toUpperCase();
      const text = turn.text.trim();
      if (!text) return;
      insertTurn.run(
        id("trn"),
        scriptId,
        i,
        turn.kind,
        (key && byName.get(key)) || null,
        turn.parenthetical?.trim() || null,
        text,
        turn.ttsText?.trim() || (turn.kind === "dialogue" ? text : null),
        turn.ttsTextTagged?.trim() || null,
        turn.delivery?.trim() || null,
      );
    });

    handle
      .prepare(`UPDATE scripts SET title = ?, parse_status = 'ready', parse_error = NULL WHERE id = ?`)
      .run(parsed.title.trim() || "Untitled", scriptId);
    handle.exec("COMMIT");
  } catch (err) {
    handle.exec("ROLLBACK");
    throw err;
  }
}

export function getScriptBundle(scriptId: string): ScriptBundle | null {
  const handle = db();
  const script = handle
    .prepare(
      `SELECT id, title, source_name, parse_status, parse_error, created_at
       FROM scripts WHERE id = ?`,
    )
    .get(scriptId) as Row | undefined;
  if (!script) return null;

  const characters = (
    handle
      .prepare(
        `SELECT id, name, ord, line_count, description FROM characters
         WHERE script_id = ? ORDER BY ord`,
      )
      .all(scriptId) as Row[]
  ).map<Character>((r) => ({
    id: String(r.id),
    name: String(r.name),
    ord: num(r.ord),
    lineCount: num(r.line_count),
    description: str(r.description),
  }));

  const turns = (
    handle
      .prepare(
        `SELECT id, idx, kind, character_id, parenthetical, text, delivery
         FROM turns WHERE script_id = ? ORDER BY idx`,
      )
      .all(scriptId) as Row[]
  ).map<Turn>((r) => ({
    id: String(r.id),
    idx: num(r.idx),
    kind: String(r.kind) as TurnKind,
    characterId: str(r.character_id),
    parenthetical: str(r.parenthetical),
    text: String(r.text),
    delivery: str(r.delivery),
  }));

  return {
    id: String(script.id),
    title: String(script.title),
    sourceName: String(script.source_name),
    parseStatus: String(script.parse_status) as ScriptBundle["parseStatus"],
    parseError: str(script.parse_error),
    createdAt: num(script.created_at),
    characters,
    turns,
  };
}

export function recentScripts(limit = 6) {
  return (
    db()
      .prepare(
        `SELECT s.id, s.title, s.parse_status, s.created_at,
                (SELECT COUNT(*) FROM characters c WHERE c.script_id = s.id) AS parts
         FROM scripts s ORDER BY s.created_at DESC LIMIT ?`,
      )
      .all(limit) as Row[]
  ).map((r) => ({
    id: String(r.id),
    title: String(r.title),
    parseStatus: String(r.parse_status),
    createdAt: num(r.created_at),
    parts: num(r.parts),
  }));
}

/** One session per script, reused — the actor is prepping one set of sides. */
export function ensureSession(scriptId: string): string {
  const existing = db()
    .prepare(`SELECT id FROM sessions WHERE script_id = ? ORDER BY created_at DESC LIMIT 1`)
    .get(scriptId) as Row | undefined;
  if (existing) return String(existing.id);

  const sessionId = id("ses");
  db()
    .prepare(
      `INSERT INTO sessions (id, script_id, user_character_id, mode, silence_ms, mic_threshold, direction_ms, current_idx, created_at)
       VALUES (?, ?, NULL, 'manual', 1200, ?, ?, 0, ?)`,
    )
    .run(sessionId, scriptId, DEFAULT_THRESHOLD, DEFAULT_DIRECTION_MS, Date.now());

  const bundle = getScriptBundle(scriptId);
  const setVoiceStmt = db().prepare(
    `INSERT OR REPLACE INTO session_voices (session_id, character_id, voice_id) VALUES (?, ?, ?)`,
  );
  bundle?.characters.forEach((c, i) => {
    setVoiceStmt.run(sessionId, c.id, defaultVoiceFor(i));
  });
  // The busiest part is the actor's own until they say otherwise.
  if (bundle?.characters.length) {
    db()
      .prepare(`UPDATE sessions SET user_character_id = ? WHERE id = ?`)
      .run(bundle.characters[0].id, sessionId);
  }
  return sessionId;
}

export function getSessionBundle(sessionId: string): SessionBundle | null {
  const handle = db();
  const session = handle
    .prepare(
      `SELECT id, script_id, user_character_id, mode, silence_ms, mic_threshold, direction_ms, current_idx
       FROM sessions WHERE id = ?`,
    )
    .get(sessionId) as Row | undefined;
  if (!session) return null;

  const script = getScriptBundle(String(session.script_id));
  if (!script) return null;

  const voices: Record<string, string> = {};
  for (const row of handle
    .prepare(`SELECT character_id, voice_id FROM session_voices WHERE session_id = ?`)
    .all(sessionId) as Row[]) {
    voices[String(row.character_id)] = String(row.voice_id);
  }

  const clips = (
    handle
      .prepare(`SELECT turn_id, status, error FROM clips WHERE session_id = ?`)
      .all(sessionId) as Row[]
  ).map<ClipState>((r) => ({
    turnId: String(r.turn_id),
    status: String(r.status) as ClipState["status"],
    error: str(r.error),
  }));

  return {
    id: String(session.id),
    mode: String(session.mode) as DialogueMode,
    silenceMs: num(session.silence_ms),
    micThreshold: clampThreshold(Number(session.mic_threshold)),
    directionMs: clampDirectionMs(Number(session.direction_ms)),
    currentIdx: num(session.current_idx),
    userCharacterId: str(session.user_character_id),
    voices,
    script,
    clips,
  };
}

export function updateSession(
  sessionId: string,
  patch: {
    userCharacterId?: string | null;
    mode?: DialogueMode;
    silenceMs?: number;
    micThreshold?: number;
    directionMs?: number;
    currentIdx?: number;
    voices?: Record<string, string>;
  },
) {
  const handle = db();
  if (patch.userCharacterId !== undefined) {
    handle
      .prepare(`UPDATE sessions SET user_character_id = ? WHERE id = ?`)
      .run(patch.userCharacterId, sessionId);
  }
  if (patch.mode) {
    handle.prepare(`UPDATE sessions SET mode = ? WHERE id = ?`).run(patch.mode, sessionId);
  }
  if (patch.silenceMs !== undefined) {
    handle
      .prepare(`UPDATE sessions SET silence_ms = ? WHERE id = ?`)
      .run(Math.max(400, Math.min(5000, patch.silenceMs)), sessionId);
  }
  if (patch.micThreshold !== undefined) {
    handle
      .prepare(`UPDATE sessions SET mic_threshold = ? WHERE id = ?`)
      .run(clampThreshold(patch.micThreshold), sessionId);
  }
  if (patch.directionMs !== undefined) {
    handle
      .prepare(`UPDATE sessions SET direction_ms = ? WHERE id = ?`)
      .run(clampDirectionMs(patch.directionMs), sessionId);
  }
  if (patch.currentIdx !== undefined) {
    handle
      .prepare(`UPDATE sessions SET current_idx = ? WHERE id = ?`)
      .run(patch.currentIdx, sessionId);
  }
  if (patch.voices) {
    const stmt = handle.prepare(
      `INSERT OR REPLACE INTO session_voices (session_id, character_id, voice_id) VALUES (?, ?, ?)`,
    );
    const clearClips = handle.prepare(
      `DELETE FROM clips WHERE session_id = ? AND turn_id IN
         (SELECT id FROM turns WHERE character_id = ?)`,
    );
    for (const [characterId, voiceId] of Object.entries(patch.voices)) {
      const current = handle
        .prepare(
          `SELECT voice_id FROM session_voices WHERE session_id = ? AND character_id = ?`,
        )
        .get(sessionId, characterId) as Row | undefined;
      if (current && String(current.voice_id) === voiceId) continue;
      stmt.run(sessionId, characterId, voiceId);
      // A new voice invalidates every line already rendered for that part.
      clearClips.run(sessionId, characterId);
    }
  }
}

export type TurnForSpeech = {
  id: string;
  idx: number;
  characterId: string | null;
  ttsText: string | null;
  ttsTextTagged: string | null;
  text: string;
};

export function getTurnForSpeech(
  scriptId: string,
  turnId: string,
): { turn: TurnForSpeech; previous: string | null; next: string | null } | null {
  const handle = db();
  const row = handle
    .prepare(
      `SELECT id, idx, character_id, tts_text, tts_text_tagged, text
       FROM turns WHERE id = ? AND script_id = ?`,
    )
    .get(turnId, scriptId) as Row | undefined;
  if (!row) return null;

  const neighbour = (offset: number) => {
    const n = handle
      .prepare(
        `SELECT tts_text, text, kind FROM turns WHERE script_id = ? AND idx = ?`,
      )
      .get(scriptId, num(row.idx) + offset) as Row | undefined;
    if (!n || String(n.kind) !== "dialogue") return null;
    return String(n.tts_text ?? n.text);
  };

  return {
    turn: {
      id: String(row.id),
      idx: num(row.idx),
      characterId: str(row.character_id),
      ttsText: str(row.tts_text),
      ttsTextTagged: str(row.tts_text_tagged),
      text: String(row.text),
    },
    previous: neighbour(-1),
    next: neighbour(1),
  };
}

export function getClip(sessionId: string, turnId: string) {
  const row = db()
    .prepare(
      `SELECT id, status, file, error, voice_id FROM clips WHERE session_id = ? AND turn_id = ?`,
    )
    .get(sessionId, turnId) as Row | undefined;
  if (!row) return null;
  return {
    id: String(row.id),
    status: String(row.status) as ClipState["status"],
    file: str(row.file),
    error: str(row.error),
    voiceId: String(row.voice_id),
  };
}

export function saveClip(input: {
  sessionId: string;
  turnId: string;
  voiceId: string;
  status: ClipState["status"];
  file?: string | null;
  error?: string | null;
}) {
  db()
    .prepare(
      `INSERT INTO clips (id, session_id, turn_id, voice_id, status, file, error, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (session_id, turn_id) DO UPDATE SET
         voice_id = excluded.voice_id,
         status = excluded.status,
         file = excluded.file,
         error = excluded.error,
         created_at = excluded.created_at`,
    )
    .run(
      id("clp"),
      input.sessionId,
      input.turnId,
      input.voiceId,
      input.status,
      input.file ?? null,
      input.error ?? null,
      Date.now(),
    );
}

export function getVoiceForCharacter(
  sessionId: string,
  characterId: string,
): string | null {
  const row = db()
    .prepare(
      `SELECT voice_id FROM session_voices WHERE session_id = ? AND character_id = ?`,
    )
    .get(sessionId, characterId) as Row | undefined;
  return row ? String(row.voice_id) : null;
}

export function getSessionScriptId(sessionId: string): string | null {
  const row = db()
    .prepare(`SELECT script_id FROM sessions WHERE id = ?`)
    .get(sessionId) as Row | undefined;
  return row ? String(row.script_id) : null;
}
