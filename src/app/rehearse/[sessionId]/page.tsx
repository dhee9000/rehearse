import { notFound } from "next/navigation";
import { Teleprompter } from "@/components/Teleprompter";
import { getSessionBundle } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function RehearsePage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const session = getSessionBundle(sessionId);
  if (!session) notFound();
  return <Teleprompter session={session} />;
}
