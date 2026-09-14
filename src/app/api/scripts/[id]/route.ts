import { NextResponse } from "next/server";
import { ensureSession, getScriptBundle, ownsScript } from "@/lib/store";
import { currentUserId } from "@/lib/session-user";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  if (!(await ownsScript(id, userId))) {
    return NextResponse.json({ error: "No such script." }, { status: 404 });
  }

  const script = await getScriptBundle(id);
  if (!script) {
    return NextResponse.json({ error: "No such script." }, { status: 404 });
  }
  const sessionId = script.parseStatus === "ready" ? await ensureSession(id) : null;
  return NextResponse.json({ script, sessionId });
}
