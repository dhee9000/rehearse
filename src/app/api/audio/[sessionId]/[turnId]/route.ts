import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { AUDIO_DIR } from "@/lib/db";
import { getClip } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string; turnId: string }> },
) {
  const { sessionId, turnId } = await params;
  const clip = getClip(sessionId, turnId);
  if (!clip?.file || clip.status !== "ready") {
    return NextResponse.json({ error: "Not rendered yet." }, { status: 404 });
  }

  const full = path.join(AUDIO_DIR, path.basename(clip.file));
  if (!fs.existsSync(full)) {
    return NextResponse.json({ error: "Clip is missing on disk." }, { status: 404 });
  }

  return new NextResponse(fs.readFileSync(full) as unknown as BodyInit, {
    headers: {
      "content-type": "audio/mpeg",
      "cache-control": "private, max-age=31536000, immutable",
    },
  });
}
