const BASE = "https://api.elevenlabs.io/v1";
const PRIMARY_MODEL = process.env.ELEVENLABS_MODEL_ID ?? "eleven_v3";
const FALLBACK_MODEL = "eleven_multilingual_v2";

export type SpeakInput = {
  voiceId: string;
  /** Clean spoken text — safe on every model. */
  text: string;
  /** Same line with v3 audio tags. Used only when the v3 model is in play. */
  taggedText?: string | null;
  previousText?: string | null;
  nextText?: string | null;
};

function apiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ELEVENLABS_API_KEY is not set.");
  return key;
}

/** Render one line. Falls back off v3 if the account can't reach it. */
export async function speak(input: SpeakInput): Promise<ArrayBuffer> {
  try {
    return await request(input, PRIMARY_MODEL);
  } catch (err) {
    const modelIsV3 = PRIMARY_MODEL.startsWith("eleven_v3");
    if (modelIsV3 && err instanceof ElevenLabsError && err.retryOnOtherModel) {
      return await request(input, FALLBACK_MODEL);
    }
    throw err;
  }
}

export class ElevenLabsError extends Error {
  status: number;
  retryOnOtherModel: boolean;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    // 401/403/404/422 on a model usually means "your account can't use this one".
    this.retryOnOtherModel = [400, 401, 403, 404, 422].includes(status);
  }
}

async function request(input: SpeakInput, modelId: string): Promise<ArrayBuffer> {
  const usesTags = modelId.startsWith("eleven_v3");
  const body: Record<string, unknown> = {
    text: (usesTags ? input.taggedText : null) ?? input.text,
    model_id: modelId,
  };
  if (input.previousText) body.previous_text = input.previousText;
  if (input.nextText) body.next_text = input.nextText;
  if (!usesTags) {
    body.voice_settings = {
      stability: 0.42,
      similarity_boost: 0.8,
      style: 0.35,
      use_speaker_boost: true,
    };
  }

  const res = await fetch(
    `${BASE}/text-to-speech/${encodeURIComponent(input.voiceId)}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey(),
        "content-type": "application/json",
        accept: "audio/mpeg",
      },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new ElevenLabsError(res.status, readError(res.status, detail));
  }
  return res.arrayBuffer();
}

function readError(status: number, detail: string): string {
  try {
    const parsed = JSON.parse(detail);
    const message =
      parsed?.detail?.message ?? parsed?.detail?.status ?? parsed?.detail;
    if (typeof message === "string") return message;
  } catch {
    /* fall through to the plain status */
  }
  if (status === 401) return "ElevenLabs rejected the API key.";
  if (status === 404) return "That voice ID doesn't exist on this account.";
  if (status === 429) return "ElevenLabs is rate limiting. Wait a moment.";
  return `ElevenLabs returned ${status}.`;
}

export type LibraryVoice = { id: string; name: string; note: string | null };

/** The account's own voices, to suggest alongside the stock list. */
export async function listVoices(): Promise<LibraryVoice[]> {
  const res = await fetch(`${BASE}/voices`, {
    headers: { "xi-api-key": apiKey() },
    cache: "no-store",
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    voices?: { voice_id: string; name: string; labels?: Record<string, string> }[];
  };
  return (data.voices ?? []).map((v) => ({
    id: v.voice_id,
    name: v.name,
    note: Object.values(v.labels ?? {}).slice(0, 2).join(", ") || null,
  }));
}
