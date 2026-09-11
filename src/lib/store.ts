import { db, id, type Driver, type Row } from "./db";
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

const str = (v: unknown) => (v == null ? null : String(v));
const num = (v: unknown) => Number(v ?? 0);

export async function createScript(input: {
  title: string;
  sourceName: string;
  sourceKind: string;
  rawText: string;
}): Promise<string> {
  const scriptId = id("scr");
  await (await db()).run(
    `INSERT INTO scripts (id, title, source_name, source_kind, raw_text, parse_status, created_at)
     VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
    [
      scriptId,
      input.title,
      input.sourceName,
      input.sourceKind,
      input.rawText,
      Date.now(),
    ],
  );
  return scriptId;
}

export async function getRawText(scriptId: string): Promise<string | null> {
  const row = await (await db()).get(
    `SELECT raw_text FROM scripts WHERE id = ?`,
    [scriptId],
  );
  return row ? String(row.raw_text) : null;
}

export async function setParseStatus(
  scriptId: string,
  status: "pending" | "parsing" | "ready" | "failed",
  error?: string | null,
) {
  await (await db()).run(
    `UPDATE scripts SET parse_status = ?, parse_error = ? WHERE id = ?`,
    [status, error ?? null, scriptId],
  );
}

export async function saveBreakdown(scriptId: string, parsed: ParsedScript) {
  const handle = await db();
  await handle.transaction(async (tx) => {
    await tx.run(`DELETE FROM turns WHERE script_id = ?`, [scriptId]);
    await tx.run(`DELETE FROM characters WHERE script_id = ?`, [scriptId]);

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

    for (const [i, c] of ordered.entries()) {
      const charId = id("chr");
      byName.set(c.key, charId);
      await tx.run(
        `INSERT INTO characters (id, script_id, name, ord, line_count, description)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [charId, scriptId, c.key, i, counts.get(c.key) ?? 0, c.description ?? null],
      );
    }

    let idx = 0;
    for (const turn of parsed.turns) {
      const text = turn.text.trim();
      if (!text) continue;
      const key = turn.character?.trim().toUpperCase();
      await tx.run(
        `INSERT INTO turns (id, script_id, idx, kind, character_id, parenthetical, text, tts_text, tts_text_tagged, delivery)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id("trn"),
          scriptId,
          idx++,
          turn.kind,
          (key && byName.get(key)) || null,
          turn.parenthetical?.trim() || null,
          text,
          turn.ttsText?.trim() || (turn.kind === "dialogue" ? text : null),
          turn.ttsTextTagged?.trim() || null,
          turn.delivery?.trim() || null,
        ],
      );
    }

    await tx.run(
      `UPDATE scripts SET title = ?, parse_status = 'ready', parse_error = NULL WHERE id = ?`,
      [parsed.title.trim() || "Untitled", scriptId],
    );
  });
}

export async function getScriptBundle(
  scriptId: string,
): Promise<ScriptBundle | null> {
  const handle = await db();
  const script = await handle.get(
    `SELECT id, title, source_name, parse_status, parse_error, created_at
     FROM scripts WHERE id = ?`,
    [scriptId],
  );
  if (!script) return null;

  const characters = (
    await handle.all(
      `SELECT id, name, ord, line_count, description FROM characters
       WHERE script_id = ? ORDER BY ord`,
      [scriptId],
    )
  ).map<Character>((r) => ({
    id: String(r.id),
    name: String(r.name),
    ord: num(r.ord),
    lineCount: num(r.line_count),
    description: str(r.description),
  }));

  const turns = (
    await handle.all(
      `SELECT id, idx, kind, character_id, parenthetical, text, delivery
       FROM turns WHERE script_id = ? ORDER BY idx`,
      [scriptId],
    )
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

export async function recentScripts(limit = 6) {
  const rows = await (await db()).all(
    `SELECT s.id, s.title, s.parse_status, s.created_at,
            (SELECT COUNT(*) FROM characters c WHERE c.script_id = s.id) AS parts
     FROM scripts s ORDER BY s.created_at DESC LIMIT ?`,
    [limit],
  );
  return rows.map((r) => ({
    id: String(r.id),
    title: String(r.title),
    parseStatus: String(r.parse_status),
    createdAt: num(r.created_at),
    parts: num(r.parts),
  }));
}

/** One session per script, reused — the actor is prepping one set of sides. */
export async function ensureSession(scriptId: string): Promise<string> {
  const handle = await db();
  const existing = await handle.get(
    `SELECT id FROM sessions WHERE script_id = ? ORDER BY created_at DESC LIMIT 1`,
    [scriptId],
  );
  if (existing) return String(existing.id);

  const sessionId = id("ses");
  await handle.run(
    `INSERT INTO sessions (id, script_id, user_character_id, mode, silence_ms, mic_threshold, direction_ms, current_idx, created_at)
     VALUES (?, ?, NULL, 'manual', 1200, ?, ?, 0, ?)`,
    [sessionId, scriptId, DEFAULT_THRESHOLD, DEFAULT_DIRECTION_MS, Date.now()],
  );

  const bundle = await getScriptBundle(scriptId);
  for (const [i, c] of (bundle?.characters ?? []).entries()) {
    await setVoice(handle, sessionId, c.id, defaultVoiceFor(i));
  }
  // The busiest part is the actor's own until they say otherwise.
  if (bundle?.characters.length) {
    await handle.run(`UPDATE sessions SET user_character_id = ? WHERE id = ?`, [
      bundle.characters[0].id,
      sessionId,
    ]);
  }
  return sessionId;
}

function setVoice(
  handle: Driver,
  sessionId: string,
  characterId: string,
  voiceId: string,
) {
  // Portable upsert — both engines accept ON CONFLICT … DO UPDATE.
  return handle.run(
    `INSERT INTO session_voices (session_id, character_id, voice_id)
     VALUES (?, ?, ?)
     ON CONFLICT (session_id, character_id) DO UPDATE SET voice_id = excluded.voice_id`,
    [sessionId, characterId, voiceId],
  );
}

export async function getSessionBundle(
  sessionId: string,
): Promise<SessionBundle | null> {
  const handle = await db();
  const session = await handle.get(
    `SELECT id, script_id, user_character_id, mode, silence_ms, mic_threshold, direction_ms, current_idx
     FROM sessions WHERE id = ?`,
    [sessionId],
  );
  if (!session) return null;

  const script = await getScriptBundle(String(session.script_id));
  if (!script) return null;

  const voices: Record<string, string> = {};
  for (const row of await handle.all(
    `SELECT character_id, voice_id FROM session_voices WHERE session_id = ?`,
    [sessionId],
  )) {
    voices[String(row.character_id)] = String(row.voice_id);
  }

  const clips = (
    await handle.all(
      `SELECT turn_id, status, error FROM clips WHERE session_id = ?`,
      [sessionId],
    )
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

export async function updateSession(
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
  const handle = await db();
  if (patch.userCharacterId !== undefined) {
    await handle.run(`UPDATE sessions SET user_character_id = ? WHERE id = ?`, [
      patch.userCharacterId,
      sessionId,
    ]);
  }
  if (patch.mode) {
    await handle.run(`UPDATE sessions SET mode = ? WHERE id = ?`, [
      patch.mode,
      sessionId,
    ]);
  }
  if (patch.silenceMs !== undefined) {
    await handle.run(`UPDATE sessions SET silence_ms = ? WHERE id = ?`, [
      Math.max(400, Math.min(5000, patch.silenceMs)),
      sessionId,
    ]);
  }
  if (patch.micThreshold !== undefined) {
    await handle.run(`UPDATE sessions SET mic_threshold = ? WHERE id = ?`, [
      clampThreshold(patch.micThreshold),
      sessionId,
    ]);
  }
  if (patch.directionMs !== undefined) {
    await handle.run(`UPDATE sessions SET direction_ms = ? WHERE id = ?`, [
      clampDirectionMs(patch.directionMs),
      sessionId,
    ]);
  }
  if (patch.currentIdx !== undefined) {
    await handle.run(`UPDATE sessions SET current_idx = ? WHERE id = ?`, [
      patch.currentIdx,
      sessionId,
    ]);
  }
  if (patch.voices) {
    for (const [characterId, voiceId] of Object.entries(patch.voices)) {
      const current = await handle.get(
        `SELECT voice_id FROM session_voices WHERE session_id = ? AND character_id = ?`,
        [sessionId, characterId],
      );
      if (current && String(current.voice_id) === voiceId) continue;
      await setVoice(handle, sessionId, characterId, voiceId);
      // A new voice invalidates every line already rendered for that part.
      await handle.run(
        `DELETE FROM clips WHERE session_id = ? AND turn_id IN
           (SELECT id FROM turns WHERE character_id = ?)`,
        [sessionId, characterId],
      );
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

export async function getTurnForSpeech(
  scriptId: string,
  turnId: string,
): Promise<
  { turn: TurnForSpeech; previous: string | null; next: string | null } | null
> {
  const handle = await db();
  const row = await handle.get(
    `SELECT id, idx, character_id, tts_text, tts_text_tagged, text
     FROM turns WHERE id = ? AND script_id = ?`,
    [turnId, scriptId],
  );
  if (!row) return null;

  const neighbour = async (offset: number) => {
    const n = await handle.get(
      `SELECT tts_text, text, kind FROM turns WHERE script_id = ? AND idx = ?`,
      [scriptId, num(row.idx) + offset],
    );
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
    previous: await neighbour(-1),
    next: await neighbour(1),
  };
}

export async function getClip(sessionId: string, turnId: string) {
  const row: Row | undefined = await (await db()).get(
    `SELECT id, status, file, url, error, voice_id FROM clips
     WHERE session_id = ? AND turn_id = ?`,
    [sessionId, turnId],
  );
  if (!row) return null;
  return {
    id: String(row.id),
    status: String(row.status) as ClipState["status"],
    file: str(row.file),
    url: str(row.url),
    error: str(row.error),
    voiceId: String(row.voice_id),
  };
}

export async function saveClip(input: {
  sessionId: string;
  turnId: string;
  voiceId: string;
  status: ClipState["status"];
  file?: string | null;
  url?: string | null;
  error?: string | null;
}) {
  await (await db()).run(
    `INSERT INTO clips (id, session_id, turn_id, voice_id, status, file, url, error, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (session_id, turn_id) DO UPDATE SET
       voice_id = excluded.voice_id,
       status = excluded.status,
       file = excluded.file,
       url = excluded.url,
       error = excluded.error,
       created_at = excluded.created_at`,
    [
      id("clp"),
      input.sessionId,
      input.turnId,
      input.voiceId,
      input.status,
      input.file ?? null,
      input.url ?? null,
      input.error ?? null,
      Date.now(),
    ],
  );
}

export async function getVoiceForCharacter(
  sessionId: string,
  characterId: string,
): Promise<string | null> {
  const row = await (await db()).get(
    `SELECT voice_id FROM session_voices WHERE session_id = ? AND character_id = ?`,
    [sessionId, characterId],
  );
  return row ? String(row.voice_id) : null;
}

export async function getSessionScriptId(
  sessionId: string,
): Promise<string | null> {
  const row = await (await db()).get(
    `SELECT script_id FROM sessions WHERE id = ?`,
    [sessionId],
  );
  return row ? String(row.script_id) : null;
}
