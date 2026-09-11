export type TurnKind = "dialogue" | "action" | "heading";
export type DialogueMode = "manual" | "auto";

export type Character = {
  id: string;
  name: string;
  ord: number;
  lineCount: number;
  description: string | null;
};

export type Turn = {
  id: string;
  idx: number;
  kind: TurnKind;
  characterId: string | null;
  parenthetical: string | null;
  text: string;
  delivery: string | null;
};

export type ScriptSummary = {
  id: string;
  title: string;
  sourceName: string;
  parseStatus: "pending" | "parsing" | "ready" | "failed";
  parseError: string | null;
  createdAt: number;
};

export type ScriptBundle = ScriptSummary & {
  characters: Character[];
  turns: Turn[];
};

export type ClipState = {
  turnId: string;
  status: "pending" | "ready" | "failed";
  error: string | null;
};

export type SessionBundle = {
  id: string;
  mode: DialogueMode;
  silenceMs: number;
  micThreshold: number;
  directionMs: number;
  currentIdx: number;
  userCharacterId: string | null;
  voices: Record<string, string>;
  script: ScriptBundle;
  clips: ClipState[];
};
