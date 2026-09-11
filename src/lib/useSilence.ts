"use client";

import { useEffect, useRef, useState } from "react";
import { floorFor, openMic, POLL_MS } from "./mic";

export type MicState = "off" | "asking" | "listening" | "speaking" | "denied";

/**
 * Watches the mic while it's the actor's line. Waits for them to actually start
 * speaking, then fires once they've been quiet for `silenceMs`. It never fires
 * on a line they haven't started — going up on a line shouldn't skip you ahead.
 */
export function useSilence({
  active,
  silenceMs,
  threshold,
  onSilence,
}: {
  active: boolean;
  silenceMs: number;
  threshold: number;
  onSilence: () => void;
}) {
  const [state, setState] = useState<MicState>("off");
  const [level, setLevel] = useState(0);
  const callback = useRef(onSilence);
  callback.current = onSilence;

  useEffect(() => {
    if (!active) {
      setState("off");
      setLevel(0);
      return;
    }

    let cancelled = false;
    // Deliberately setInterval, not requestAnimationFrame: rAF is throttled or
    // paused when the tab is occluded or backgrounded, which would stall
    // silence detection mid-scene and leave the actor waiting forever.
    let timer: ReturnType<typeof setInterval> | null = null;
    let mic: Awaited<ReturnType<typeof openMic>> | null = null;

    const floor = floorFor(threshold);
    let spoke = false;
    let onsetSince = 0;
    let quietSince = 0;
    let lastPublished = 0;

    setState("asking");

    openMic()
      .then((handle) => {
        if (cancelled) {
          handle.close();
          return;
        }
        mic = handle;
        setState("listening");

        const tick = () => {
          if (cancelled) return;
          const rms = handle.read();
          const now = performance.now();

          // The meter only needs ~12fps; per-frame state would re-render the
          // whole teleprompter 60 times a second.
          if (now - lastPublished > 80) {
            lastPublished = now;
            setLevel(rms);
          }

          if (rms > threshold) {
            quietSince = 0;
            if (!onsetSince) onsetSince = now;
            if (!spoke && now - onsetSince > 110) {
              spoke = true;
              setState("speaking");
            }
          } else {
            onsetSince = 0;
            if (rms < floor) {
              if (!quietSince) quietSince = now;
              if (spoke && now - quietSince > silenceMs) {
                spoke = false;
                quietSince = 0;
                setState("listening");
                callback.current();
              }
            } else {
              quietSince = 0;
            }
          }
        };
        timer = setInterval(tick, POLL_MS);
      })
      .catch(() => {
        if (!cancelled) setState("denied");
      });

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      mic?.close();
    };
  }, [active, silenceMs, threshold]);

  return { state, level };
}
