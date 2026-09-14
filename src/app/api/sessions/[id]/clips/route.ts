import { NextResponse } from "next/server";
import { speak } from "@/lib/elevenlabs";
import { storage } from "@/lib/storage";
import { currentUserId } from "@/lib/session-user";
import {
  getClip,
  ownedSessionScriptId,
  getTurnForSpeech,
  getVoiceForCharacter,
  saveClip,
} from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Render one line for one scene partner. Idempotent — a line that is already
 *  rendered with the current voice returns straight away. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: sessionId } = await params;
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  const { turnId } = (await request.json()) as { turnId?: string };
  if (!turnId) {
    return NextResponse.json({ error: "Missing turnId." }, { status: 400 });
  }

  // Ownership resolves the script id, so an unowned session can't render.
  const scriptId = await ownedSessionScriptId(sessionId, userId);
  if (!scriptId) {
    return NextResponse.json({ error: "No such session." }, { status: 404 });
  }

  const found = await getTurnForSpeech(scriptId, turnId);
  if (!found?.turn.characterId) {
    return NextResponse.json({ error: "That turn has no speaker." }, { status: 400 });
  }

  const voiceId = await getVoiceForCharacter(sessionId, found.turn.characterId);
  if (!voiceId) {
    return NextResponse.json(
      { error: "That part has no voice assigned yet." },
      { status: 400 },
    );
  }

  const existing = await getClip(sessionId, turnId);
  if (existing?.status === "ready" && existing.voiceId === voiceId && existing.file) {
    return NextResponse.json({ turnId, status: "ready" });
  }

  if (!process.env.ELEVENLABS_API_KEY) {
    const error = "ELEVENLABS_API_KEY is not set on the server.";
    await saveClip({ sessionId, turnId, voiceId, status: "failed", error });
    return NextResponse.json({ turnId, status: "failed", error }, { status: 500 });
  }

  try {
    const audio = await speak({
      voiceId,
      text: found.turn.ttsText ?? found.turn.text,
      taggedText: found.turn.ttsTextTagged,
      previousText: found.previous,
      nextText: found.next,
    });
    const stored = await (await storage()).put(
      `${sessionId}__${turnId}.mp3`,
      Buffer.from(audio),
      "audio/mpeg",
    );
    await saveClip({
      sessionId,
      turnId,
      voiceId,
      status: "ready",
      file: stored.key,
      url: stored.url,
    });
    return NextResponse.json({ turnId, status: "ready" });
  } catch (err) {
    const error = err instanceof Error ? err.message : "Rendering failed.";
    await saveClip({ sessionId, turnId, voiceId, status: "failed", error });
    return NextResponse.json({ turnId, status: "failed", error }, { status: 502 });
  }
}
