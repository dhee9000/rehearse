import { NextResponse } from "next/server";
import { getSessionBundle, updateSession } from "@/lib/store";
import type { DialogueMode } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = getSessionBundle(id);
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
  const body = (await request.json()) as {
    userCharacterId?: string | null;
    mode?: DialogueMode;
    silenceMs?: number;
    micThreshold?: number;
    directionMs?: number;
    currentIdx?: number;
    voices?: Record<string, string>;
  };

  updateSession(id, body);
  const session = getSessionBundle(id);
  if (!session) {
    return NextResponse.json({ error: "No such session." }, { status: 404 });
  }
  return NextResponse.json({ session });
}
