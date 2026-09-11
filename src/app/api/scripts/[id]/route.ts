import { NextResponse } from "next/server";
import { ensureSession, getScriptBundle } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const script = await getScriptBundle(id);
  if (!script) {
    return NextResponse.json({ error: "No such script." }, { status: 404 });
  }
  const sessionId = script.parseStatus === "ready" ? await ensureSession(id) : null;
  return NextResponse.json({ script, sessionId });
}
