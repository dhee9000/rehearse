import { notFound } from "next/navigation";
import { Teleprompter } from "@/components/Teleprompter";
import { auth } from "@clerk/nextjs/server";
import { getSessionBundle, ownedSessionScriptId } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function RehearsePage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const { userId, redirectToSignIn } = await auth();
  if (!userId) return redirectToSignIn();
  if (!(await ownedSessionScriptId(sessionId, userId))) notFound();

  const session = await getSessionBundle(sessionId);
  if (!session) notFound();
  return <Teleprompter session={session} />;
}
