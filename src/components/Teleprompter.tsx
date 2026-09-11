"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSilence } from "@/lib/useSilence";
import { Button, Slate } from "./ui";
import type { SessionBundle, Turn } from "@/lib/types";

type Phase = "standby" | "counting" | "running" | "paused" | "done";

const SIZES = ["text-[1.6rem]", "text-[2.15rem]", "text-[2.9rem]"];

export function Teleprompter({ session }: { session: SessionBundle }) {
  const { script, mode, silenceMs, userCharacterId } = session;
  const turns = script.turns;

  const nameOf = useMemo(
    () => new Map(script.characters.map((c) => [c.id, c.name])),
    [script.characters],
  );
  const clipStatus = useMemo(
    () => new Map(session.clips.map((c) => [c.turnId, c.status])),
    [session.clips],
  );

  const [phase, setPhase] = useState<Phase>("standby");
  const [idx, setIdx] = useState(() =>
    Math.min(session.currentIdx, Math.max(turns.length - 1, 0)),
  );
  const [count, setCount] = useState(3);
  const [size, setSize] = useState(1);
  const audio = useRef<HTMLAudioElement | null>(null);

  const turn: Turn | undefined = turns[idx];
  const roleOf = useCallback(
    (t: Turn | undefined) => {
      if (!t || t.kind !== "dialogue" || !t.characterId) return "other" as const;
      return t.characterId === userCharacterId
        ? ("mine" as const)
        : ("partner" as const);
    },
    [userCharacterId],
  );
  const role = roleOf(turn);
  const hasClip = turn ? clipStatus.get(turn.id) === "ready" : false;

  const advance = useCallback(() => {
    setIdx((i) => {
      if (i >= turns.length - 1) {
        setPhase("done");
        return i;
      }
      return i + 1;
    });
  }, [turns.length]);

  const back = useCallback(() => setIdx((i) => Math.max(0, i - 1)), []);

  /* ── drive the current beat ─────────────────────────────────────────── */
  useEffect(() => {
    const element = audio.current;
    if (phase !== "running" || !turn) {
      element?.pause();
      return;
    }

    if (role === "partner" && hasClip && element) {
      element.src = `/api/audio/${session.id}/${turn.id}`;
      element.currentTime = 0;
      const onEnd = () => advance();
      element.addEventListener("ended", onEnd);
      element.addEventListener("error", onEnd);
      void element.play().catch(() => undefined);
      return () => {
        element.removeEventListener("ended", onEnd);
        element.removeEventListener("error", onEnd);
        element.pause();
      };
    }

    // Nothing to play. Auto mode reads it and moves on; manual waits for you.
    if (mode === "auto" && role !== "mine") {
      const timer = setTimeout(advance, readTime(turn.text));
      return () => clearTimeout(timer);
    }
  }, [phase, idx, turn, role, hasClip, mode, advance, session.id]);

  /* ── the mic, only while it's your line ─────────────────────────────── */
  const mic = useSilence({
    active: phase === "running" && mode === "auto" && role === "mine",
    silenceMs,
    onSilence: advance,
  });

  /* ── preload the next voiced line ───────────────────────────────────── */
  useEffect(() => {
    const next = turns[idx + 1];
    if (!next || roleOf(next) !== "partner") return;
    if (clipStatus.get(next.id) !== "ready") return;
    const warm = new Audio(`/api/audio/${session.id}/${next.id}`);
    warm.preload = "auto";
    warm.load();
  }, [idx, turns, roleOf, clipStatus, session.id]);

  /* ── keys ───────────────────────────────────────────────────────────── */
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === " " || event.key === "ArrowRight" || event.key === "Enter") {
        event.preventDefault();
        if (phase === "standby") start();
        else if (phase === "running") advance();
        else if (phase === "paused") setPhase("running");
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        back();
        return;
      }
      if (event.key.toLowerCase() === "p") {
        setPhase((p) =>
          p === "running" ? "paused" : p === "paused" ? "running" : p,
        );
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /* ── remember where we got to ───────────────────────────────────────── */
  useEffect(() => {
    const timer = setTimeout(() => {
      void fetch(`/api/sessions/${session.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentIdx: idx }),
      }).catch(() => undefined);
    }, 900);
    return () => clearTimeout(timer);
  }, [idx, session.id]);

  function start() {
    audio.current ??= new Audio();
    setPhase("counting");
    setCount(3);
  }

  useEffect(() => {
    if (phase !== "counting") return;
    if (count === 0) {
      setPhase("running");
      return;
    }
    const timer = setTimeout(() => setCount((c) => c - 1), 620);
    return () => clearTimeout(timer);
  }, [phase, count]);

  const partnerName = nameOf.get(turn?.characterId ?? "") ?? "";

  return (
    <main className="grain relative flex h-dvh flex-col overflow-hidden bg-stage-900">
      <Chrome
        title={script.title}
        part={nameOf.get(userCharacterId ?? "") ?? "—"}
        mode={mode}
        scriptId={script.id}
        phase={phase}
        size={size}
        onSize={setSize}
        onPause={() =>
          setPhase((p) => (p === "running" ? "paused" : p === "paused" ? "running" : p))
        }
      />

      <div className="relative flex flex-1 flex-col items-center justify-center px-6 py-4">
        {phase === "standby" && (
          <Standby
            mode={mode}
            part={nameOf.get(userCharacterId ?? "") ?? "your part"}
            resuming={idx > 0}
            onStart={start}
            onRestart={() => {
              setIdx(0);
              start();
            }}
          />
        )}

        {phase === "counting" && (
          <p
            key={count}
            className="marquee page-up text-[clamp(6rem,22vw,14rem)] text-marker"
            aria-hidden
          >
            {count === 0 ? "" : count}
          </p>
        )}

        {phase === "done" && (
          <div className="rise max-w-sm text-center">
            <Slate className="text-marker">End of scene</Slate>
            <h2 className="marquee mt-4 text-[clamp(2.4rem,7vw,4rem)] text-paper">
              That&apos;s the scene
            </h2>
            <div className="mt-8 flex justify-center gap-3">
              <Button
                onClick={() => {
                  setIdx(0);
                  start();
                }}
              >
                Run it again
              </Button>
              <Link
                href={`/script/${script.id}`}
                className="slate inline-flex items-center rounded-page border border-stage-600 px-5 py-3 text-muted transition-colors hover:border-cue hover:text-paper"
              >
                Change the setup
              </Link>
            </div>
          </div>
        )}

        {(phase === "running" || phase === "paused") && turn && (
          <div className="flex w-full max-w-3xl flex-col items-stretch gap-5">
            <Ghost turn={turns[idx - 1]} nameOf={nameOf} />

            <Page
              key={turn.id}
              turn={turn}
              mine={role === "mine"}
              speaker={role === "partner" ? partnerName : null}
              size={size}
            />

            <Ghost turn={turns[idx + 1]} nameOf={nameOf} />
          </div>
        )}

        {phase === "paused" && (
          <div className="absolute inset-0 flex items-center justify-center bg-stage-900/70 backdrop-blur-sm">
            <button
              onClick={() => setPhase("running")}
              className="marquee text-[clamp(2rem,6vw,3.4rem)] text-paper transition-colors hover:text-marker"
            >
              Held
            </button>
          </div>
        )}
      </div>

      <Footer
        phase={phase}
        role={role}
        hasClip={hasClip}
        mode={mode}
        micState={mic.state}
        micLevel={mic.level}
        speaker={partnerName}
        turns={turns}
        idx={idx}
        roleOf={roleOf}
        onJump={(i) => setIdx(i)}
      />
    </main>
  );
}

/* ───────────────────────────────  the lit page  ─────────────────────────── */

function Page({
  turn,
  mine,
  speaker,
  size,
}: {
  turn: Turn;
  mine: boolean;
  speaker: string | null;
  size: number;
}) {
  if (turn.kind === "heading") {
    return (
      <div className="page-up paper-grain rounded-page bg-paper px-8 py-10 text-center shadow-[0_34px_90px_-40px_rgba(0,0,0,0.95)] sm:px-14">
        <p className="script text-[clamp(1.1rem,3vw,1.6rem)] uppercase tracking-[0.16em] text-ink">
          {turn.text}
        </p>
      </div>
    );
  }

  if (turn.kind === "action") {
    return (
      <div className="page-up paper-grain rounded-page bg-paper px-8 py-10 shadow-[0_34px_90px_-40px_rgba(0,0,0,0.95)] sm:px-14">
        <p className="script text-[clamp(1.05rem,2.6vw,1.5rem)] italic leading-[1.55] text-ink-soft">
          {turn.text}
        </p>
      </div>
    );
  }

  return (
    <div className="page-up paper-grain rounded-page bg-paper px-8 py-10 shadow-[0_34px_90px_-40px_rgba(0,0,0,0.95)] sm:px-14 sm:py-12">
      <p className="script flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[0.8125rem] tracking-[0.22em] text-ink-soft">
        {mine ? "You" : speaker}
        {turn.parenthetical && (
          <span className="tracking-normal lowercase italic opacity-75">
            ({turn.parenthetical})
          </span>
        )}
      </p>
      <p
        className={`script mt-4 leading-[1.42] text-ink ${SIZES[size]} sm:leading-[1.38]`}
      >
        <span className={mine ? "swipe" : ""}>{turn.text}</span>
      </p>
      {turn.delivery && turn.delivery !== turn.parenthetical && (
        <p className="mt-5 border-t border-paper-edge pt-3 text-[0.8125rem] italic text-ink-soft">
          {turn.delivery}
        </p>
      )}
    </div>
  );
}

function Ghost({
  turn,
  nameOf,
}: {
  turn: Turn | undefined;
  nameOf: Map<string, string>;
}) {
  if (!turn) return <div className="h-6" aria-hidden />;
  const who = nameOf.get(turn.characterId ?? "");
  return (
    <p
      aria-hidden
      className="script truncate px-8 text-[0.9375rem] text-faint sm:px-14"
    >
      {who && <span className="tracking-[0.2em]">{who} </span>}
      {turn.text}
    </p>
  );
}

/* ───────────────────────────────  chrome  ───────────────────────────────── */

function Chrome({
  title,
  part,
  mode,
  scriptId,
  phase,
  size,
  onSize,
  onPause,
}: {
  title: string;
  part: string;
  mode: string;
  scriptId: string;
  phase: Phase;
  size: number;
  onSize: (n: number) => void;
  onPause: () => void;
}) {
  return (
    <header className="flex shrink-0 items-center justify-between gap-5 border-b border-stage-800 px-5 py-3.5">
      <Link
        href={`/script/${scriptId}`}
        className="slate shrink-0 text-faint transition-colors hover:text-paper"
      >
        ← Setup
      </Link>

      <div className="flex min-w-0 items-baseline gap-3">
        <span className="truncate text-[0.875rem] text-muted">{title}</span>
        <span className="script shrink-0 text-[0.8125rem] tracking-[0.18em] text-marker">
          {part}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <Slate className="mr-1 hidden text-faint sm:inline">
          {mode === "auto" ? "On silence" : "On keypress"}
        </Slate>
        <button
          onClick={() => onSize(Math.max(0, size - 1))}
          className="slate rounded-page border border-stage-700 px-2.5 py-1.5 text-muted transition-colors hover:text-paper"
          aria-label="Smaller text"
        >
          A
        </button>
        <button
          onClick={() => onSize(Math.min(SIZES.length - 1, size + 1))}
          className="slate rounded-page border border-stage-700 px-2.5 py-1.5 text-[0.8125rem] text-muted transition-colors hover:text-paper"
          aria-label="Larger text"
        >
          A
        </button>
        {(phase === "running" || phase === "paused") && (
          <button
            onClick={onPause}
            className="slate ml-1 rounded-page border border-stage-700 px-3 py-1.5 text-muted transition-colors hover:text-paper"
          >
            {phase === "paused" ? "Resume" : "Hold"}
          </button>
        )}
      </div>
    </header>
  );
}

function Standby({
  mode,
  part,
  resuming,
  onStart,
  onRestart,
}: {
  mode: string;
  part: string;
  resuming: boolean;
  onStart: () => void;
  onRestart: () => void;
}) {
  return (
    <div className="rise max-w-md text-center">
      <Slate className="text-muted">Playing</Slate>
      <h1 className="marquee mt-3 text-[clamp(2.6rem,8vw,4.6rem)] text-paper">
        {part}
      </h1>
      <p className="mt-6 text-[0.9375rem] leading-relaxed text-muted">
        {mode === "auto"
          ? "Your mic listens while you speak. Stop, and the scene moves on. Space always works too."
          : "Space or the right arrow moves to the next line. Left arrow steps back."}
      </p>
      <div className="mt-9 flex justify-center gap-3">
        <Button onClick={onStart}>{resuming ? "Pick it up" : "Roll"}</Button>
        {resuming && (
          <Button kind="ghost" onClick={onRestart}>
            From the top
          </Button>
        )}
      </div>
    </div>
  );
}

/* ───────────────────────────────  footer  ──────────────────────────────── */

function Footer({
  phase,
  role,
  hasClip,
  mode,
  micState,
  micLevel,
  speaker,
  turns,
  idx,
  roleOf,
  onJump,
}: {
  phase: Phase;
  role: "mine" | "partner" | "other";
  hasClip: boolean;
  mode: string;
  micState: string;
  micLevel: number;
  speaker: string;
  turns: Turn[];
  idx: number;
  roleOf: (t: Turn | undefined) => "mine" | "partner" | "other";
  onJump: (i: number) => void;
}) {
  const live = micState === "listening" || micState === "speaking";

  return (
    <footer className="shrink-0 border-t border-stage-800 px-5 pb-4 pt-3">
      <div className="flex h-6 items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2.5">
          {phase === "running" && role === "mine" && mode === "auto" && (
            <>
              <span
                className={`h-2.5 w-2.5 shrink-0 rounded-full bg-tally ${
                  micState === "speaking" ? "" : "tally"
                }`}
              />
              <Slate className="truncate text-tally">
                {micState === "denied"
                  ? "No mic — press space"
                  : micState === "speaking"
                    ? "Hearing you"
                    : "Listening"}
              </Slate>
              {live && (
                <span className="hidden h-[3px] w-24 overflow-hidden rounded-full bg-stage-700 sm:block">
                  <span
                    className="block h-full bg-tally transition-[width] duration-75"
                    style={{ width: `${Math.min(100, micLevel * 900)}%` }}
                  />
                </span>
              )}
            </>
          )}
          {phase === "running" && role === "mine" && mode === "manual" && (
            <Slate className="text-marker">Your line — space when you&apos;re done</Slate>
          )}
          {phase === "running" && role === "partner" && (
            <Slate className="truncate text-cue">
              {hasClip ? `${speaker} is reading` : `${speaker} — no audio rendered`}
            </Slate>
          )}
          {phase === "running" && role === "other" && (
            <Slate className="text-faint">Scene direction</Slate>
          )}
        </div>

        <Slate className="shrink-0 text-faint">
          {Math.min(idx + 1, turns.length)} / {turns.length}
        </Slate>
      </div>

      {/* The beat rail: every turn in the scene, coloured by who carries it. */}
      <div className="mt-2.5 flex h-5 items-end gap-[2px]">
        {turns.map((t, i) => {
          const r = roleOf(t);
          const past = i < idx;
          const here = i === idx;
          return (
            <button
              key={t.id}
              onClick={() => onJump(i)}
              aria-label={`Jump to beat ${i + 1}`}
              className={`flex-1 rounded-[1px] transition-all duration-200 hover:opacity-100 ${
                here
                  ? "h-5 opacity-100"
                  : past
                    ? "h-2.5 opacity-70"
                    : "h-2.5 opacity-30"
              } ${
                r === "mine"
                  ? "bg-marker"
                  : r === "partner"
                    ? "bg-cue"
                    : "bg-stage-500"
              }`}
            />
          );
        })}
      </div>
    </footer>
  );
}

/** Rough time to take in a line of direction, so auto mode doesn't rush it. */
function readTime(text: string): number {
  const words = text.trim().split(/\s+/).length;
  return Math.min(9000, Math.max(1500, words * 330));
}
