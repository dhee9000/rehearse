import { NextResponse } from "next/server";
import { listVoices } from "@/lib/elevenlabs";

export const runtime = "nodejs";

export async function GET() {
  if (!process.env.ELEVENLABS_API_KEY) return NextResponse.json({ voices: [] });
  try {
    return NextResponse.json({ voices: await listVoices() });
  } catch {
    return NextResponse.json({ voices: [] });
  }
}
