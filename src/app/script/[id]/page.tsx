import { notFound } from "next/navigation";
import { Setup } from "@/components/Setup";
import { auth } from "@clerk/nextjs/server";
import {
  ensureSession,
  getScriptBundle,
  getSessionBundle,
  ownsScript,
} from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function ScriptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { userId, redirectToSignIn } = await auth();
  if (!userId) return redirectToSignIn();
  // notFound rather than a permission error: someone else's script id should
  // be indistinguishable from one that doesn't exist.
  if (!(await ownsScript(id, userId))) notFound();

  const script = await getScriptBundle(id);
  if (!script) notFound();

  const session =
    script.parseStatus === "ready"
      ? await getSessionBundle(await ensureSession(id))
      : null;

  return <Setup initialScript={script} initialSession={session} />;
}
