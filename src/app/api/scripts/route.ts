import { NextResponse } from "next/server";
import { extractText, guessTitle } from "@/lib/extract";
import { createScript } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    let text = "";
    let sourceName = "Pasted text";
    let sourceKind = "text";

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File) || file.size === 0) {
        return NextResponse.json({ error: "Choose a file first." }, { status: 400 });
      }
      if (file.size > 12 * 1024 * 1024) {
        return NextResponse.json(
          { error: "That file is over 12 MB. Upload just the sides." },
          { status: 400 },
        );
      }
      const extracted = await extractText(file);
      text = extracted.text;
      sourceKind = extracted.kind;
      sourceName = file.name;
    } else {
      const body = (await request.json()) as { text?: string };
      text = (body.text ?? "").trim();
    }

    if (text.replace(/\s/g, "").length < 40) {
      return NextResponse.json(
        { error: "There isn't enough text here to break down." },
        { status: 400 },
      );
    }

    const id = await createScript({
      title: guessTitle(text, sourceName.replace(/\.[^.]+$/, "")),
      sourceName,
      sourceKind,
      rawText: text.slice(0, 400_000),
    });

    return NextResponse.json({ id });
  } catch (err) {
    return NextResponse.json({ error: message(err) }, { status: 500 });
  }
}

function message(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Couldn't read that file.";
}
