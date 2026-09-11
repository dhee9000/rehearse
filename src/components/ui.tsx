import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function Slate({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <span className={`slate ${className}`}>{children}</span>;
}

const base =
  "inline-flex items-center justify-center gap-2.5 select-none transition-[transform,background-color,border-color,color,opacity] duration-200 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40 disabled:active:translate-y-0";

const kinds = {
  primary:
    "bg-marker text-ink hover:bg-[#ffc736] shadow-[0_1px_0_0_rgba(255,255,255,0.25)_inset]",
  ghost:
    "bg-transparent text-muted border border-stage-600 hover:border-cue hover:text-paper",
  quiet: "bg-stage-700 text-paper hover:bg-stage-600",
} as const;

export function Button({
  kind = "primary",
  className = "",
  ...props
}: ComponentProps<"button"> & { kind?: keyof typeof kinds }) {
  return (
    <button
      {...props}
      className={`${base} ${kinds[kind]} slate px-5 py-3 ${className}`}
    />
  );
}

export function ButtonLink({
  kind = "primary",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { kind?: keyof typeof kinds }) {
  return (
    <Link
      {...props}
      className={`${base} ${kinds[kind]} slate px-5 py-3 ${className}`}
    />
  );
}

/** The app mark. Archivo pushed wide — the only place it appears twice. */
export function Wordmark({ href = "/" }: { href?: string }) {
  return (
    <Link
      href={href}
      className="group inline-flex items-baseline gap-2.5"
      aria-label="Rehearse — home"
    >
      <span className="marquee text-[0.9rem] text-paper">Rehearse</span>
      <span
        aria-hidden
        className="h-[7px] w-[7px] rounded-full bg-marker transition-transform duration-300 group-hover:scale-125"
      />
    </Link>
  );
}
