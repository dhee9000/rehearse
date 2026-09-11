import { notFound } from "next/navigation";
import { Setup } from "@/components/Setup";
import { ensureSession, getScriptBundle, getSessionBundle } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function ScriptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const script = getScriptBundle(id);
  if (!script) notFound();

  const session =
    script.parseStatus === "ready" ? getSessionBundle(ensureSession(id)) : null;

  return <Setup initialScript={script} initialSession={session} />;
}
