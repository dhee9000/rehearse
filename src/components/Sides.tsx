import type { Character, Turn } from "@/lib/types";

/** The breakdown, set the way sides actually look — Courier, cues in caps,
 *  the actor's own lines under a highlighter pass. */
export function Sides({
  turns,
  characters,
  userCharacterId,
  title,
}: {
  turns: Turn[];
  characters: Character[];
  userCharacterId: string | null;
  title: string;
}) {
  const nameOf = new Map(characters.map((c) => [c.id, c.name]));

  return (
    <article className="paper-grain rounded-page bg-paper px-7 py-9 shadow-[0_28px_70px_-34px_rgba(0,0,0,0.85)] sm:px-12 sm:py-12">
      <header className="flex items-baseline justify-between gap-4 border-b border-paper-edge pb-3.5">
        <span className="slate truncate text-ink-soft">{title}</span>
        <span className="slate shrink-0 text-ink-soft">
          {turns.length} beats
        </span>
      </header>

      <div className="mt-8 flex flex-col gap-6">
        {turns.map((turn) => {
          if (turn.kind === "heading") {
            return (
              <p
                key={turn.id}
                className="script mt-3 text-[0.8125rem] uppercase tracking-[0.14em] text-ink-soft first:mt-0"
              >
                {turn.text}
              </p>
            );
          }
          if (turn.kind === "action") {
            return (
              <p
                key={turn.id}
                className="script max-w-[46ch] text-[0.9375rem] leading-[1.6] text-ink-soft"
              >
                {turn.text}
              </p>
            );
          }
          const mine = turn.characterId === userCharacterId;
          return (
            <div key={turn.id} className="max-w-[46ch]">
              <p className="script flex items-baseline gap-2 text-[0.8125rem] tracking-[0.2em] text-ink-soft">
                {nameOf.get(turn.characterId ?? "") ?? "—"}
                {turn.parenthetical && (
                  <span className="tracking-normal lowercase italic opacity-70">
                    ({turn.parenthetical})
                  </span>
                )}
              </p>
              <p className="script mt-1.5 text-[1.0625rem] leading-[1.6] text-ink">
                <span className={mine ? "swipe" : ""}>{turn.text}</span>
              </p>
            </div>
          );
        })}
      </div>
    </article>
  );
}
