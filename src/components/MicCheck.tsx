"use client";

import { useEffect, useRef, useState } from "react";
import { Slate } from "./ui";
import {
  clampThreshold,
  meterPercent,
  openMic,
  POLL_MS,
  type MicHandle,
} from "@/lib/mic";

type Status = "off" | "asking" | "live" | "denied";

const ROOM_TONE_MS = 2000;
/** Where to put the line relative to the loudest thing in a quiet room. */
const ROOM_TONE_HEADROOM = 2.6;
/** Below this a mic isn't quiet, it's dead — muted, wrong input, no signal.
 *  Calibrating to it would set the line so low that anything counts as
 *  talking, so refuse and say so instead. */
const SILENT_INPUT = 0.0008;

const pctToThreshold = (pct: number) =>
  clampThreshold((pct / 100) ** 2 * 0.25);

export function MicCheck({
  threshold,
  onChange,
}: {
  threshold: number;
  /** Fires continuously while dragging; the caller debounces the save. */
  onChange: (value: number) => void;
}) {
  const [status, setStatus] = useState<Status>("off");
  const [hearing, setHearing] = useState(false);
  const [sampling, setSampling] = useState(0);
  const [note, setNote] = useState<string | null>(null);

  const fill = useRef<HTMLDivElement>(null);
  const peak = useRef<HTMLDivElement>(null);
  const mic = useRef<MicHandle | null>(null);
  const thresholdRef = useRef(threshold);
  thresholdRef.current = threshold;
  // Room tone needs to write the threshold out without waiting on a render.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (status !== "live") return;
    let held = 0;
    let heardNow = false;

    const tick = () => {
      const handle = mic.current;
      if (!handle) return;
      const rms = handle.read();
      const pct = meterPercent(rms);

      // Written straight to the DOM — 60fps of React state would be wasteful.
      if (fill.current) fill.current.style.width = `${pct}%`;
      held = Math.max(pct, held - 1.6);
      if (peak.current) peak.current.style.left = `${held}%`;

      const isHearing = rms > thresholdRef.current;
      if (isHearing !== heardNow) {
        heardNow = isHearing;
        setHearing(isHearing);
      }
    };
    const timer = setInterval(tick, POLL_MS);
    return () => clearInterval(timer);
  }, [status]);

  useEffect(
    () => () => {
      mic.current?.close();
      mic.current = null;
    },
    [],
  );

  async function turnOn() {
    setStatus("asking");
    try {
      mic.current = await openMic();
      setStatus("live");
    } catch {
      setStatus("denied");
    }
  }

  async function takeRoomTone() {
    if (!mic.current) return;
    setNote(null);
    const started = performance.now();
    let loudest = 0;
    setSampling(Math.ceil(ROOM_TONE_MS / 1000));

    await new Promise<void>((done) => {
      const sampler = setInterval(() => {
        const handle = mic.current;
        if (!handle) {
          clearInterval(sampler);
          return done();
        }
        loudest = Math.max(loudest, handle.read());
        const elapsed = performance.now() - started;
        setSampling(Math.max(1, Math.ceil((ROOM_TONE_MS - elapsed) / 1000)));
        if (elapsed >= ROOM_TONE_MS) {
          clearInterval(sampler);
          done();
        }
      }, POLL_MS);
    });

    setSampling(0);

    if (loudest < SILENT_INPUT) {
      setNote(
        "That mic isn't picking anything up. Check it's the right input and not muted.",
      );
      return;
    }
    onChangeRef.current(clampThreshold(loudest * ROOM_TONE_HEADROOM));
    setNote("Line set just above your room. Say a line to check it.");
  }

  const markerPct = meterPercent(threshold);

  return (
    <section>
      <h2 className="slate flex items-center gap-3 text-muted">
        Your mic
        <span className="h-px flex-1 bg-stage-800" />
      </h2>

      {status === "off" && (
        <>
          <p className="mt-2 text-[0.8125rem] leading-relaxed text-muted">
            Set the line where your voice starts, so a noisy room doesn&apos;t
            hold the scene open.
          </p>
          <button
            onClick={turnOn}
            className="slate mt-3.5 w-full rounded-page border border-stage-600 px-3 py-2.5 text-muted transition-colors hover:border-cue hover:text-paper"
          >
            Turn the mic on
          </button>
        </>
      )}

      {status === "asking" && (
        <p className="mt-3 text-[0.8125rem] text-muted">
          Waiting on the browser&apos;s mic permission…
        </p>
      )}

      {status === "denied" && (
        <p role="alert" className="mt-3 text-[0.8125rem] leading-relaxed text-tally">
          The browser blocked the mic. Allow it in the address bar, or run the
          scene on keypress instead.
        </p>
      )}

      {status === "live" && (
        <>
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <span
                className={`h-2 w-2 shrink-0 rounded-full transition-colors ${
                  hearing ? "bg-tally" : "bg-stage-600"
                }`}
              />
              <Slate className={hearing ? "text-tally" : "text-faint"}>
                {hearing ? "Hearing you" : "Quiet"}
              </Slate>
            </span>
            <Slate className="text-faint">Say a line</Slate>
          </div>

          {/* The meter. Drag the marker to set where talking begins. */}
          <div className="relative mt-2.5 h-11 select-none">
            <div className="absolute inset-x-0 top-1/2 h-6 -translate-y-1/2 overflow-hidden rounded-page bg-stage-800">
              <div
                ref={fill}
                style={{ width: "0%" }}
                className={`h-full transition-colors duration-150 ${
                  hearing ? "bg-tally/70" : "bg-cue/40"
                }`}
              />
            </div>

            {/* Decaying peak hold, so a short syllable is still visible. */}
            <div
              ref={peak}
              style={{ left: "0%" }}
              aria-hidden
              className="pointer-events-none absolute top-1/2 h-6 w-[2px] -translate-y-1/2 bg-paper/50"
            />

            <input
              type="range"
              min={0}
              max={100}
              step={0.5}
              value={markerPct}
              onChange={(e) => onChange(pctToThreshold(Number(e.target.value)))}
              aria-label="Level that counts as talking"
              aria-valuetext={`${Math.round(markerPct)} percent`}
              className="mic-range absolute inset-0 h-full w-full"
            />

            <div
              aria-hidden
              style={{ left: `${markerPct}%` }}
              className="mic-marker pointer-events-none absolute top-0 h-full w-[3px] -translate-x-1/2 rounded-full bg-marker"
            >
              <span className="absolute -top-0.5 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-marker" />
              <span className="absolute -bottom-0.5 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-marker" />
            </div>
          </div>

          <p className="mt-1.5 text-[0.75rem] leading-relaxed text-faint">
            Under the line is room noise. Over it counts as talking.
          </p>

          <button
            onClick={takeRoomTone}
            disabled={sampling > 0}
            className="slate mt-3 w-full rounded-page border border-stage-600 px-3 py-2.5 text-muted transition-colors hover:border-cue hover:text-paper disabled:opacity-50"
          >
            {sampling > 0 ? `Stay quiet — ${sampling}` : "Take room tone"}
          </button>
          <p
            role={note ? "status" : undefined}
            className={`mt-1.5 text-[0.75rem] leading-relaxed ${
              note?.startsWith("That mic") ? "text-tally" : "text-faint"
            }`}
          >
            {note ?? "Sets the line just above your room. Stay quiet while it listens."}
          </p>
        </>
      )}
    </section>
  );
}
