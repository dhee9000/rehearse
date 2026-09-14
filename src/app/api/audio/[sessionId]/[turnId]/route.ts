import { NextResponse } from "next/server";
import { getClip, ownedSessionScriptId } from "@/lib/store";
import { storage } from "@/lib/storage";
import { currentUserId } from "@/lib/session-user";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string; turnId: string }> },
) {
  const { sessionId, turnId } = await params;
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  if (!(await ownedSessionScriptId(sessionId, userId))) {
    return NextResponse.json({ error: "Not rendered yet." }, { status: 404 });
  }

  const clip = await getClip(sessionId, turnId);
  if (!clip || clip.status !== "ready" || !clip.file) {
    return NextResponse.json({ error: "Not rendered yet." }, { status: 404 });
  }

  // Blob-backed clips are served straight from their CDN URL.
  if (clip.url) return NextResponse.redirect(clip.url, 302);

  const bytes = await (await storage()).read(clip.file);
  if (!bytes) {
    return NextResponse.json({ error: "Clip is missing." }, { status: 404 });
  }

  return new NextResponse(bytes as unknown as BodyInit, {
    headers: {
      "content-type": "audio/mpeg",
      "cache-control": "private, max-age=31536000, immutable",
    },
  });
}
