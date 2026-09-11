import { ButtonLink, Slate, Wordmark } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="grain relative flex min-h-dvh flex-col">
      <header className="px-6 py-7 lg:px-12">
        <Wordmark />
      </header>
      <div className="flex flex-1 items-center px-6 lg:px-12">
        <div className="rise max-w-md">
          <Slate className="text-marker">Cut</Slate>
          <h1 className="marquee mt-4 text-[clamp(2.4rem,7vw,4rem)] text-paper">
            Nothing here
          </h1>
          <p className="mt-5 text-[0.9375rem] leading-relaxed text-muted">
            That script or session isn&apos;t on this machine. Upload the sides
            again and we&apos;ll pick it up from there.
          </p>
          <ButtonLink href="/" className="mt-8">
            Start a script
          </ButtonLink>
        </div>
      </div>
    </main>
  );
}
