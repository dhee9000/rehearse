"use client";

import { useEffect, useRef, useState } from "react";

export type MicState = "off" | "asking" | "listening" | "speaking" | "denied";

/**
 * Watches the mic while it's the actor's line. Waits for them to actually start
 * speaking, then fires once they've been quiet for `silenceMs`. It never fires
 * on a line they haven't started — going up on a line shouldn't skip you ahead.
 */
export function useSilence({
  active,
  silenceMs,
  onSilence,
}: {
  active: boolean;
  silenceMs: number;
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
    let frame = 0;
    let stream: MediaStream | null = null;
    let context: AudioContext | null = null;

    // Speech has to clear this for a moment before silence means anything.
    const ONSET = 0.045;
    const FLOOR = 0.02;
    let spoke = false;
    let onsetSince = 0;
    let quietSince = 0;

    setState("asking");

    navigator.mediaDevices
      .getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      })
      .then((granted) => {
        if (cancelled) {
          granted.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = granted;
        context = new AudioContext();
        const source = context.createMediaStreamSource(granted);
        const analyser = context.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.7;
        source.connect(analyser);

        const buffer = new Float32Array(analyser.fftSize);
        setState("listening");

        const tick = () => {
          if (cancelled) return;
          analyser.getFloatTimeDomainData(buffer);
          let sum = 0;
          for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
          const rms = Math.sqrt(sum / buffer.length);
          setLevel(rms);

          const now = performance.now();
          if (rms > ONSET) {
            quietSince = 0;
            if (!onsetSince) onsetSince = now;
            if (!spoke && now - onsetSince > 110) {
              spoke = true;
              setState("speaking");
            }
          } else {
            onsetSince = 0;
            if (rms < FLOOR) {
              if (!quietSince) quietSince = now;
              if (spoke && now - quietSince > silenceMs) {
                spoke = false;
                quietSince = 0;
                setState("listening");
                callback.current();
                return;
              }
            } else {
              quietSince = 0;
            }
          }
          frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      })
      .catch(() => {
        if (!cancelled) setState("denied");
      });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((t) => t.stop());
      void context?.close();
    };
  }, [active, silenceMs]);

  return { state, level };
}
