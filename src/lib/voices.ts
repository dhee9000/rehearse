/** Stock ElevenLabs voices, used to pre-fill each part so a session can start
 *  with zero typing. Overwrite any of them with a voice ID from your library. */
export const STOCK_VOICES = [
  { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel", note: "warm, grounded" },
  { id: "pNInz6obpgDQGcFmaJgB", name: "Adam", note: "low, steady" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah", note: "bright, quick" },
  { id: "ErXwobaYiN019PkySvjV", name: "Antoni", note: "easy, open" },
  { id: "AZnzlk1XvdvUeBnXmlld", name: "Domi", note: "sharp, forward" },
  { id: "VR6AewLTigWG4xSOukaG", name: "Arnold", note: "gravelled" },
  { id: "MF3mGyEYCl7XYWbV9V6O", name: "Elli", note: "young, airy" },
  { id: "yoZ06aMxZJJ28mfd3POQ", name: "Sam", note: "flat, wry" },
] as const;

export function defaultVoiceFor(index: number): string {
  return STOCK_VOICES[index % STOCK_VOICES.length].id;
}
