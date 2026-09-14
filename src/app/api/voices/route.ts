import { NextResponse } from "next/server";
import { listVoices } from "@/lib/elevenlabs";
import { currentUserId } from "@/lib/session-user";

export const runtime = "nodejs";

export async function GET() {
  // The voice library is the account's, not the public's.
  if (!(await currentUserId())) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  if (!process.env.ELEVENLABS_API_KEY) return NextResponse.json({ voices: [] });
  try {
    return NextResponse.json({ voices: await listVoices() });
  } catch {
    return NextResponse.json({ voices: [] });
  }
}
