import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { z } from "zod";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5";

const ParsedSchema = z.object({
  title: z.string().min(1).max(120),
  characters: z
    .array(
      z.object({
        name: z.string().min(1).max(60),
        description: z.string().max(200).nullish(),
      }),
    )
    .min(1),
  turns: z
    .array(
      z.object({
        kind: z.enum(["dialogue", "action", "heading"]),
        character: z.string().nullish(),
        parenthetical: z.string().max(120).nullish(),
        text: z.string().min(1),
        ttsText: z.string().nullish(),
        ttsTextTagged: z.string().nullish(),
        delivery: z.string().max(120).nullish(),
      }),
    )
    .min(1),
});

export type ParsedScript = z.infer<typeof ParsedSchema>;

const SYSTEM = `You are a script supervisor. You convert raw script text — sides, a full screenplay, a stage play, or a rough paste — into a clean, ordered rehearsal breakdown.

Return ONE JSON object and nothing else. No prose, no markdown fence.

Shape:
{
  "title": string,
  "characters": [{ "name": string, "description": string|null }],
  "turns": [{
    "kind": "dialogue" | "action" | "heading",
    "character": string|null,
    "parenthetical": string|null,
    "text": string,
    "ttsText": string|null,
    "ttsTextTagged": string|null,
    "delivery": string|null
  }]
}

Rules:

CHARACTERS
- One entry per speaking part. Normalise every alias to a single canonical name (JOHN, JOHNNY, JOHN (V.O.) -> JOHN). Uppercase.
- Drop (CONT'D), (V.O.), (O.S.), (O.C.) from the name; if the delivery is off-screen or voice-over, say so in "delivery" instead.
- "description": a half-sentence of who they are, only if the script actually tells you. Otherwise null.

TURNS — in performance order, one per beat
- "heading": a slugline or scene header (INT. KITCHEN - NIGHT). character null.
- "action": stage direction or business the actor should see but nobody speaks. character null.
- "dialogue": one character speaking once. Merge dialogue split across a page break or a (MORE)/(CONT'D) into one turn.
- "text": exactly what belongs on the teleprompter — the spoken words, cleaned. No character name, no parenthetical, no page numbers, no revision marks, no "CONTINUED:".
- "parenthetical": the bracketed acting note if the script gives one (beat, sotto, laughing). Otherwise null.

TTS — these fields drive the scene-partner voice
- "ttsText": "text" rewritten to be *spoken* cleanly. Expand numerals, abbreviations, and symbols ("$5" -> "five dollars", "Dr." -> "Doctor", "1998" -> "nineteen ninety-eight"). Keep contractions, stammers, and dialect exactly as written — they are performance. Keep em-dash interruptions. Remove any stage direction that leaked into the line.
- "ttsTextTagged": the same line with ElevenLabs v3 audio tags inline where the script genuinely calls for one — [whispers], [shouts], [laughs], [sighs], [nervously], [crying], [sarcastic], [pause]. Use at most one or two per line, only when the text or the parenthetical supports it. If the line needs none, repeat ttsText unchanged.
- "delivery": a few words of direction for the reader, drawn from the scene (e.g. "cold, already leaving"). Null if the script gives no signal.
- For "action" and "heading" turns set ttsText, ttsTextTagged and delivery to null.

Discard title pages, cast lists, page headers/footers, and scene numbers. If the input is only a fragment, break down what is there.`;

export async function parseScript(rawText: string): Promise<ParsedScript> {
  const { text } = await generateText({
    model: anthropic(MODEL),
    system: SYSTEM,
    maxOutputTokens: 64000,
    providerOptions: {
      anthropic: {
        thinking: { type: "adaptive" },
        effort: "medium",
      },
    },
    prompt: `Break down this script for rehearsal.\n\n<script>\n${rawText}\n</script>`,
  });

  const json = extractJson(text);
  if (!json) {
    throw new Error("The breakdown came back unreadable. Try again.");
  }

  const parsed = ParsedSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(
      `The breakdown was incomplete: ${parsed.error.issues[0]?.message ?? "unknown field"}`,
    );
  }
  return parsed.data;
}

/** Claude is asked for bare JSON, but tolerate a fence or a stray sentence. */
function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < candidate.length; i++) {
    const ch = candidate[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') inString = !inString;
    if (inString) continue;
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(candidate.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}
