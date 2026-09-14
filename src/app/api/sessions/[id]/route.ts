import { NextResponse } from "next/server";
import {
  getSessionBundle,
  ownedSessionScriptId,
  updateSession,
} from "@/lib/store";
import type { DialogueMode } from "@/lib/types";
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
  if (!(await ownedSessionScriptId(id, userId))) {
    return NextResponse.json({ error: "No such session." }, { status: 404 });
  }

  const session = await getSessionBundle(id);
  if (!session) {
    return NextResponse.json({ error: "No such session." }, { status: 404 });
  }
  return NextResponse.json({ session });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  if (!(await ownedSessionScriptId(id, userId))) {
    return NextResponse.json({ error: "No such session." }, { status: 404 });
  }

  const body = (await request.json()) as {
    userCharacterId?: string | null;
    mode?: DialogueMode;
    silenceMs?: number;
    micThreshold?: number;
    directionMs?: number;
    currentIdx?: number;
    voices?: Record<string, string>;
  };

  await updateSession(id, body);
  const session = await getSessionBundle(id);
  if (!session) {
    return NextResponse.json({ error: "No such session." }, { status: 404 });
  }
  return NextResponse.json({ session });
}
