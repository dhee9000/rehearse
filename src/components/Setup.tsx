"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { MicCheck } from "./MicCheck";
import { Sides } from "./Sides";
import { Button, ButtonLink, Slate, Wordmark } from "./ui";
import { STOCK_VOICES } from "@/lib/voices";
import {
  directionDwell,
  DIRECTION_MAX_MS,
  DIRECTION_MIN_MS,
} from "@/lib/pacing";
import type { DialogueMode, ScriptBundle, SessionBundle } from "@/lib/types";

type ClipStatus = "idle" | "pending" | "ready" | "failed";
type LibraryVoice = { id: string; name: string; note: string | null };

export function Setup({
  initialScript,
  initialSession,
}: {
  initialScript: ScriptBundle;
  initialSession: SessionBundle | null;
}) {
  const router = useRouter();
  const search = useSearchParams();

  const [script, setScript] = useState(initialScript);
  const [session, setSession] = useState(initialSession);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(script.parseError);

  const runParse = useCallback(async () => {
    setParsing(true);
    setError(null);
    try {
      const res = await fetch(`/api/scripts/${script.id}/parse`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "The breakdown failed.");
      setScript(data.script);
      const bundle = await fetch(`/api/sessions/${data.sessionId}`).then((r) =>
        r.json(),
      );
      setSession(bundle.session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The breakdown failed.");
    } finally {
      setParsing(false);
    }
  }, [script.id]);

  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStarted.current) return;
    if (search.get("start") === "1" && script.parseStatus !== "ready") {
      autoStarted.current = true;
      void runParse();
    }
  }, [search, script.parseStatus, runParse]);

  return (
    <main className="grain relative min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-stage-800 bg-stage-900/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-[92rem] items-center justify-between gap-6 px-6 py-4 lg:px-10">
          <Wordmark />
          <p className="min-w-0 flex-1 truncate text-center text-[0.9375rem] text-muted">
            {script.title}
          </p>
          <span className="flex shrink-0 items-center gap-3">
            <Slate className="text-faint">
              {script.parseStatus === "ready"
                ? `${script.characters.length} parts`
                : "Not broken down"}
            </Slate>
            <UserButton
              appearance={{
                elements: { avatarBox: "h-7 w-7 rounded-full ring-1 ring-stage-600" },
              }}
            />
          </span>
        </div>
      </header>

      {script.parseStatus === "ready" && session ? (
        <Ready
          script={script}
          session={session}
          onSession={setSession}
          onReparse={runParse}
          parsing={parsing}
          router={router}
        />
      ) : (
        <Waiting
          title={script.title}
          sourceName={script.sourceName}
          parsing={parsing}
          error={error}
          onParse={runParse}
        />
      )}
    </main>
  );
}

/* ─────────────────────────────  before the breakdown  ───────────────────── */

const BEATS = [
  "Reading the pages",
  "Sorting out who speaks",
  "Cleaning the lines for the read",
  "Marking the delivery",
];

function Waiting({
  title,
  sourceName,
  parsing,
  error,
  onParse,
}: {
  title: string;
  sourceName: string;
  parsing: boolean;
  error: string | null;
  onParse: () => void;
}) {
  const [beat, setBeat] = useState(0);
  useEffect(() => {
    if (!parsing) return;
    const timer = setInterval(
      () => setBeat((b) => Math.min(b + 1, BEATS.length - 1)),
      4200,
    );
    return () => clearInterval(timer);
  }, [parsing]);

  return (
    <div className="mx-auto flex min-h-[70dvh] max-w-xl flex-col justify-center px-6 py-20">
      <div className="rise">
        <Slate className="text-marker">{parsing ? "Working" : "Ready when you are"}</Slate>
        <h1 className="marquee mt-4 text-[clamp(2.2rem,6vw,3.4rem)] text-paper">
          {parsing ? "Breaking down" : "Break down"}
          <br />
          the script
        </h1>
        <p className="script mt-5 text-[0.9375rem] text-muted">{sourceName}</p>

        {parsing ? (
          <ul className="mt-10 flex flex-col gap-3" aria-live="polite">
            {BEATS.map((label, i) => (
              <li
                key={label}
                className={`flex items-center gap-3 text-[0.9375rem] transition-colors duration-500 ${
                  i <= beat ? "text-paper" : "text-faint"
                }`}
              >
                <span
                  className={`h-[3px] w-7 shrink-0 transition-colors duration-500 ${
                    i < beat
                      ? "bg-marker"
                      : i === beat
                        ? "tally bg-marker"
                        : "bg-stage-700"
                  }`}
                />
                {label}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-6 max-w-sm text-[0.9375rem] leading-relaxed text-muted">
            Claude reads {title ? `“${title}”` : "the pages"}, separates the
            parts, and cleans each line so it can be spoken aloud.
          </p>
        )}

        {error && (
          <p role="alert" className="mt-8 text-[0.9375rem] text-tally">
            {error}
          </p>
        )}

        {!parsing && (
          <div className="mt-9 flex gap-3">
            <Button onClick={onParse}>
              {error ? "Try again" : "Break it down"}
            </Button>
            <ButtonLink href="/" kind="ghost">
              Start over
            </ButtonLink>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────  the configure rail  ─────────────────────── */

function Ready({
  script,
  session,
  onSession,
  onReparse,
  parsing,
  router,
}: {
  script: ScriptBundle;
  session: SessionBundle;
  onSession: (s: SessionBundle) => void;
  onReparse: () => void;
  parsing: boolean;
  router: ReturnType<typeof useRouter>;
}) {
  const [voices, setVoices] = useState<Record<string, string>>(session.voices);
  const [library, setLibrary] = useState<LibraryVoice[]>([]);
  const [clips, setClips] = useState<Record<string, ClipStatus>>(() =>
    Object.fromEntries(session.clips.map((c) => [c.turnId, c.status])),
  );
  const [rendering, setRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [threshold, setThreshold] = useState(session.micThreshold);
  const savedThreshold = useRef(session.micThreshold);
  const pendingThreshold = useRef<number | null>(null);

  const saveThreshold = useCallback(
    async (value: number) => {
      savedThreshold.current = value;
      pendingThreshold.current = null;
      await fetch(`/api/sessions/${session.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ micThreshold: value }),
      }).catch(() => undefined);
    },
    [session.id],
  );

  useEffect(() => {
    if (threshold === savedThreshold.current) return;
    pendingThreshold.current = threshold;
    const timer = setTimeout(() => void saveThreshold(threshold), 300);
    return () => clearTimeout(timer);
  }, [threshold, saveThreshold]);

  /** Leaving for the scene must not drop a threshold mid-debounce. */
  const startScene = useCallback(async () => {
    if (pendingThreshold.current !== null) {
      await saveThreshold(pendingThreshold.current);
    }
    router.push(`/rehearse/${session.id}`);
  }, [router, saveThreshold, session.id]);

  useEffect(() => {
    fetch("/api/voices")
      .then((r) => r.json())
      .then((d) => setLibrary(d.voices ?? []))
      .catch(() => undefined);
  }, []);

  const patch = useCallback(
    async (body: Record<string, unknown>) => {
      const res = await fetch(`/api/sessions/${session.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) return;
      const data = await res.json();
      onSession(data.session);
      setClips(
        Object.fromEntries(
          data.session.clips.map((c: { turnId: string; status: ClipStatus }) => [
            c.turnId,
            c.status,
          ]),
        ),
      );
    },
    [session.id, onSession],
  );

  const voiceOptions = useMemo(() => {
    const byId = new Map<string, { id: string; name: string }>();
    for (const v of [...library, ...STOCK_VOICES]) {
      if (!byId.has(v.id)) byId.set(v.id, { id: v.id, name: v.name });
    }
    return [...byId.values()];
  }, [library]);

  const longestDirection = useMemo(() => {
    const directions = script.turns.filter(
      (t) => t.kind === "action" || t.kind === "heading",
    );
    if (directions.length === 0) return null;
    return directions.reduce(
      (worst, t) => Math.max(worst, directionDwell(t.text, session.directionMs)),
      0,
    );
  }, [script.turns, session.directionMs]);

  const partners = useMemo(
    () => script.characters.filter((c) => c.id !== session.userCharacterId),
    [script.characters, session.userCharacterId],
  );

  const needed = useMemo(
    () =>
      script.turns.filter(
        (t) =>
          t.kind === "dialogue" &&
          t.characterId &&
          t.characterId !== session.userCharacterId,
      ),
    [script.turns, session.userCharacterId],
  );

  const readyCount = needed.filter((t) => clips[t.id] === "ready").length;
  const failedCount = needed.filter((t) => clips[t.id] === "failed").length;
  const allReady = needed.length > 0 && readyCount === needed.length;
  const missingVoice = partners.some((c) => !voices[c.id]?.trim());

  async function renderAll() {
    setRendering(true);
    setRenderError(null);
    await patch({ voices });

    const queue = needed.filter((t) => clips[t.id] !== "ready");
    setClips((prev) => {
      const next = { ...prev };
      for (const t of queue) next[t.id] = "pending";
      return next;
    });

    let cursor = 0;
    let firstError: string | null = null;

    async function worker() {
      while (cursor < queue.length) {
        const turn = queue[cursor++];
        try {
          const res = await fetch(`/api/sessions/${session.id}/clips`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ turnId: turn.id }),
          });
          const data = await res.json();
          if (!res.ok || data.status !== "ready") {
            firstError ??= data.error ?? "A line didn't render.";
            setClips((prev) => ({ ...prev, [turn.id]: "failed" }));
          } else {
            setClips((prev) => ({ ...prev, [turn.id]: "ready" }));
          }
        } catch {
          firstError ??= "Lost the connection while rendering.";
          setClips((prev) => ({ ...prev, [turn.id]: "failed" }));
        }
      }
    }

    await Promise.all([worker(), worker(), worker()]);
    setRenderError(firstError);
    setRendering(false);
  }

  return (
    <div className="mx-auto grid max-w-[92rem] gap-10 px-6 py-10 lg:grid-cols-[24rem_minmax(0,1fr)] lg:gap-14 lg:px-10">
      <div className="flex flex-col gap-9 lg:sticky lg:top-24 lg:max-h-[calc(100dvh-8rem)] lg:overflow-y-auto lg:pr-1 hide-scrollbar">
        {/* Your part */}
        <section>
          <SectionLabel>Your part</SectionLabel>
          <div className="mt-3 flex flex-col gap-1">
            {script.characters.map((c) => {
              const active = c.id === session.userCharacterId;
              return (
                <button
                  key={c.id}
                  onClick={() => void patch({ userCharacterId: c.id })}
                  aria-pressed={active}
                  className={`group flex items-center justify-between gap-3 rounded-page border px-3.5 py-3 text-left transition-colors ${
                    active
                      ? "border-marker/60 bg-marker/[0.09]"
                      : "border-transparent hover:border-stage-600 hover:bg-stage-800/60"
                  }`}
                >
                  <span className="min-w-0">
                    <span
                      className={`script block truncate text-[0.9375rem] tracking-[0.12em] ${
                        active ? "text-marker" : "text-paper"
                      }`}
                    >
                      {c.name}
                    </span>
                    {c.description && (
                      <span className="mt-0.5 block truncate text-[0.8125rem] text-muted">
                        {c.description}
                      </span>
                    )}
                  </span>
                  <Slate
                    className={`shrink-0 ${active ? "text-marker" : "text-faint"}`}
                  >
                    {active ? "You" : `${c.lineCount}`}
                  </Slate>
                </button>
              );
            })}
          </div>
        </section>

        {/* Their voices */}
        <section>
          <SectionLabel>Their voices</SectionLabel>
          <p className="mt-2 text-[0.8125rem] leading-relaxed text-muted">
            One ElevenLabs voice per part. Pre-filled with stock voices — paste
            an ID from your library to swap any of them.
          </p>
          <div className="mt-4 flex flex-col gap-3">
            {partners.map((c) => (
              <label key={c.id} className="block">
                <span className="script text-[0.8125rem] tracking-[0.18em] text-cue">
                  {c.name}
                </span>
                <input
                  value={voices[c.id] ?? ""}
                  list="voice-options"
                  spellCheck={false}
                  onChange={(e) =>
                    setVoices((prev) => ({ ...prev, [c.id]: e.target.value }))
                  }
                  onBlur={() => void patch({ voices })}
                  placeholder="Voice ID"
                  className="script mt-1.5 w-full rounded-page border border-stage-700 bg-stage-800/70 px-3 py-2.5 text-[0.8125rem] text-paper placeholder:text-stage-600 focus:border-cue focus:outline-none"
                />
                <span className="mt-1 block text-[0.75rem] text-faint">
                  {labelForVoice(voices[c.id], library)}
                </span>
              </label>
            ))}
            {partners.length === 0 && (
              <p className="text-[0.875rem] text-muted">
                Every part is yours. Pick a different part above to hear someone
                read back.
              </p>
            )}
          </div>
          <datalist id="voice-options">
            {voiceOptions.map((v) => (
              <option key={v.id} value={v.id} label={v.name} />
            ))}
          </datalist>
        </section>

        {/* How it runs */}
        <section>
          <SectionLabel>How it runs</SectionLabel>
          <div className="mt-3 grid grid-cols-2 gap-1 rounded-page border border-stage-700 p-1">
            {(
              [
                ["manual", "Press to advance"],
                ["auto", "Advance on silence"],
              ] as [DialogueMode, string][]
            ).map(([value, label]) => (
              <button
                key={value}
                onClick={() => void patch({ mode: value })}
                aria-pressed={session.mode === value}
                className={`slate rounded-page px-3 py-2.5 transition-colors ${
                  session.mode === value
                    ? "bg-stage-700 text-paper"
                    : "text-muted hover:text-paper"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mt-2.5 text-[0.8125rem] leading-relaxed text-muted">
            {session.mode === "manual"
              ? "Space or the right arrow moves to the next line. Nothing moves without you."
              : "Your mic listens. When you stop speaking, the scene moves on."}
          </p>

          {session.mode === "auto" && (
            <label className="mt-5 block">
              <span className="flex items-baseline justify-between">
                <Slate className="text-muted">Hold on directions</Slate>
                <span className="script text-[0.8125rem] text-marker">
                  {(session.directionMs / 1000).toFixed(1)}s
                </span>
              </span>
              <input
                type="range"
                min={DIRECTION_MIN_MS}
                max={DIRECTION_MAX_MS}
                step={100}
                value={session.directionMs}
                onChange={(e) =>
                  void patch({ directionMs: Number(e.target.value) })
                }
                className="mt-2.5 w-full accent-[var(--color-marker)]"
              />
              <span className="mt-1.5 block text-[0.75rem] leading-relaxed text-faint">
                Nobody speaks the stage directions. Longer ones hold a little
                longer
                {longestDirection
                  ? ` — the longest here sits for ${(longestDirection / 1000).toFixed(1)}s.`
                  : "."}
              </span>
            </label>
          )}

          {session.mode === "auto" && (
            <label className="mt-5 block">
              <span className="flex items-baseline justify-between">
                <Slate className="text-muted">Hold after you stop</Slate>
                <span className="script text-[0.8125rem] text-marker">
                  {(session.silenceMs / 1000).toFixed(1)}s
                </span>
              </span>
              <input
                type="range"
                min={600}
                max={3000}
                step={100}
                value={session.silenceMs}
                onChange={(e) =>
                  void patch({ silenceMs: Number(e.target.value) })
                }
                className="mt-2.5 w-full accent-[var(--color-marker)]"
              />
            </label>
          )}
        </section>

        {session.mode === "auto" && (
          <MicCheck threshold={threshold} onChange={setThreshold} />
        )}

        {/* Render + go */}
        <section className="border-t border-stage-800 pt-7">
          <div className="flex items-baseline justify-between">
            <SectionLabel>Scene partner lines</SectionLabel>
            <Slate className={failedCount ? "text-tally" : "text-muted"}>
              {readyCount}/{needed.length}
              {failedCount ? ` — ${failedCount} failed` : ""}
            </Slate>
          </div>

          <TickRail turns={needed.map((t) => clips[t.id] ?? "idle")} />

          {renderError && (
            <p role="alert" className="mt-3 text-[0.8125rem] text-tally">
              {renderError}
            </p>
          )}

          <div className="mt-5 flex flex-col gap-2.5">
            {!allReady && (
              <Button
                onClick={renderAll}
                disabled={rendering || missingVoice || needed.length === 0}
              >
                {rendering
                  ? `Rendering ${readyCount}/${needed.length}`
                  : failedCount
                    ? "Render the rest"
                    : "Render the voices"}
              </Button>
            )}
            <Button
              kind={allReady ? "primary" : "quiet"}
              onClick={() => void startScene()}
            >
              {allReady
                ? "Start the scene"
                : readyCount > 0
                  ? "Start with what's rendered"
                  : "Start without voices"}
            </Button>
            <button
              onClick={onReparse}
              disabled={parsing}
              className="slate self-start px-1 py-1 text-faint transition-colors hover:text-paper disabled:opacity-40"
            >
              {parsing ? "Re-reading…" : "Read the script again"}
            </button>
          </div>
        </section>
      </div>

      <div className="min-w-0">
        <Sides
          turns={script.turns}
          characters={script.characters}
          userCharacterId={session.userCharacterId}
          title={script.title}
        />
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="slate flex items-center gap-3 text-muted">
      {children}
      <span className="h-px flex-1 bg-stage-800" />
    </h2>
  );
}

/** One tick per line the scene partners have to speak. */
function TickRail({ turns }: { turns: ClipStatus[] }) {
  if (turns.length === 0) return null;
  return (
    <div className="mt-3 flex h-4 items-end gap-[2px]">
      {turns.map((status, i) => (
        <span
          key={i}
          className={`flex-1 rounded-[1px] transition-all duration-300 ${
            status === "ready"
              ? "h-4 bg-marker"
              : status === "failed"
                ? "h-4 bg-tally"
                : status === "pending"
                  ? "tally h-3 bg-marker/50"
                  : "h-1.5 bg-stage-700"
          }`}
        />
      ))}
    </div>
  );
}

function labelForVoice(
  voiceId: string | undefined,
  library: LibraryVoice[],
): string {
  if (!voiceId?.trim()) return "No voice set";
  const match =
    library.find((v) => v.id === voiceId) ??
    STOCK_VOICES.find((v) => v.id === voiceId);
  if (!match) return "Custom voice";
  return "note" in match && match.note ? `${match.name} — ${match.note}` : match.name;
}
