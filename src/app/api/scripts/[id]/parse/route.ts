import { NextResponse } from "next/server";
import { parseScript } from "@/lib/parse";
import {
  ensureSession,
  getRawText,
  getScriptBundle,
  saveBreakdown,
  setParseStatus,
} from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const rawText = getRawText(id);
  if (!rawText) {
    return NextResponse.json({ error: "No such script." }, { status: 404 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not set on the server." },
      { status: 500 },
    );
  }

  setParseStatus(id, "parsing");
  try {
    const parsed = await parseScript(rawText);
    saveBreakdown(id, parsed);
    const sessionId = ensureSession(id);
    return NextResponse.json({ script: getScriptBundle(id), sessionId });
  } catch (err) {
    const error = err instanceof Error ? err.message : "The breakdown failed.";
    setParseStatus(id, "failed", error);
    return NextResponse.json({ error }, { status: 502 });
  }
}
