import Link from "next/link";
import { Intake } from "@/components/Intake";
import { Slate, Wordmark } from "@/components/ui";
import { recentScripts } from "@/lib/store";

export const dynamic = "force-dynamic";

/* The specimen in the hero is a real fragment, marked up the way an actor
   marks up sides — their own lines under a highlighter pass. */
const SPECIMEN = [
  { who: "MARA", line: "You read the whole thing?", mine: true },
  { who: "DEV", line: "Twice. On the train.", mine: false },
  { who: "MARA", line: "And you still came.", mine: true },
  { who: "DEV", line: "I brought a pen.", mine: false },
];

export default function Home() {
  const recents = recentScripts();

  return (
    <main className="grain relative min-h-dvh overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-[28rem] left-1/2 h-[52rem] w-[52rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(242,183,5,0.11),transparent_62%)] blur-2xl"
      />

      <header className="relative mx-auto flex max-w-7xl items-center justify-between px-6 py-7 lg:px-12">
        <Wordmark />
        <Slate className="text-muted">Self-tape prep</Slate>
      </header>

      <div className="relative mx-auto grid max-w-7xl gap-16 px-6 pb-24 pt-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.86fr)] lg:gap-20 lg:px-12 lg:pt-10">
        <section className="rise">
          <h1 className="marquee text-[clamp(2.6rem,6.1vw,4.7rem)] text-paper">
            Someone to
            <br />
            read with
            <span className="text-marker">.</span>
          </h1>

          <p className="mt-7 max-w-md text-[1.0625rem] leading-relaxed text-muted">
            Drop in your sides. Say which part is yours. Every other part gets a
            voice and reads back to you, on cue, while the lines scroll.
          </p>

          <div className="mt-11">
            <Intake />
          </div>

          {recents.length > 0 && (
            <div className="mt-12 border-t border-stage-700 pt-6">
              <Slate className="text-muted">Recent</Slate>
              <ul className="mt-3.5 flex flex-col">
                {recents.map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/script/${s.id}`}
                      className="group flex items-baseline justify-between gap-4 border-b border-stage-800 py-2.5 transition-colors hover:border-stage-600"
                    >
                      <span className="truncate text-[0.9375rem] text-muted transition-colors group-hover:text-paper">
                        {s.title}
                      </span>
                      <Slate className="shrink-0 text-faint transition-colors group-hover:text-marker">
                        {s.parseStatus === "ready"
                          ? `${s.parts} parts`
                          : s.parseStatus}
                      </Slate>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* ── The artifact: a page of sides, lit, slightly off-square ── */}
        <section
          aria-hidden
          className="rise relative hidden self-start lg:block"
          style={{ animationDelay: "120ms" }}
        >
          <div className="relative mx-auto max-w-[30rem] rotate-[1.1deg]">
            <div
              className="absolute inset-0 translate-x-2 translate-y-3 rounded-page bg-stage-800"
              aria-hidden
            />
            <div className="paper-grain relative rounded-page bg-paper px-10 py-11 shadow-[0_28px_70px_-30px_rgba(0,0,0,0.9)]">
              <div className="flex items-baseline justify-between border-b border-paper-edge pb-3">
                <span className="slate text-ink-soft">Sides — Scene 14</span>
                <span className="slate text-ink-soft">2.</span>
              </div>

              <p className="script mt-7 text-[0.8125rem] uppercase tracking-wide text-ink-soft">
                Int. Rooftop — Dusk
              </p>

              <div className="mt-6 flex flex-col gap-6">
                {SPECIMEN.map((beat, i) => (
                  <div key={i}>
                    <p className="script text-[0.8125rem] tracking-[0.2em] text-ink-soft">
                      {beat.who}
                    </p>
                    <p className="script mt-1.5 text-[1.0625rem] leading-[1.55] text-ink">
                      <span className={beat.mine ? "swipe" : ""}>
                        {beat.line}
                      </span>
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-9 flex items-center gap-2.5 border-t border-paper-edge pt-4">
                <span className="h-2 w-2 rounded-full bg-marker" />
                <span className="slate text-ink-soft">Your lines — Mara</span>
              </div>
            </div>
          </div>
        </section>
      </div>

      <footer className="relative mx-auto max-w-7xl px-6 pb-10 lg:px-12">
        <p className="text-[0.8125rem] text-faint">
          Scripts stay on this machine. Voices are rendered once and cached.
        </p>
      </footer>
    </main>
  );
}
