import mammoth from "mammoth";

export type Extracted = { text: string; kind: "pdf" | "docx" | "text" };

/** Pull plain text out of whatever the actor dropped in. */
export async function extractText(
  file: File | { name: string; type: string; buffer: ArrayBuffer },
): Promise<Extracted> {
  const name = file.name ?? "script";
  const buffer =
    file instanceof File ? await file.arrayBuffer() : file.buffer;
  const lower = name.toLowerCase();
  const type = file.type ?? "";

  if (lower.endsWith(".pdf") || type === "application/pdf") {
    const { extractText: extractPdf, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractPdf(pdf, { mergePages: true });
    return { text: normalize(text), kind: "pdf" };
  }

  if (lower.endsWith(".docx") || lower.endsWith(".doc") || type.includes("word")) {
    const { value } = await mammoth.extractRawText({
      buffer: Buffer.from(buffer),
    });
    return { text: normalize(value), kind: "docx" };
  }

  return { text: normalize(new TextDecoder().decode(buffer)), kind: "text" };
}

function normalize(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/ /g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

/** First non-empty line, cleaned up, as a working title. */
export function guessTitle(text: string, fallback: string): string {
  const line = text
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 1 && l.length < 90);
  if (!line) return fallback;
  return line.replace(/^["'“”]+|["'“”]+$/g, "").slice(0, 80);
}
