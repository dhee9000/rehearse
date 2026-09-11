# Rehearse

Run your sides out loud. Upload a script, say which part is yours, and every
other part gets an ElevenLabs voice that reads back to you on cue while the
lines scroll — built for actors prepping a self-tape.

## What it does

1. **Take the script in** — PDF, DOCX, or pasted text.
2. **Break it down** — Claude (via the Vercel AI SDK) reads the pages, separates
   the parts, orders the beats, and rewrites each line into a clean spoken form
   plus an ElevenLabs v3 tagged variant and a delivery note.
3. **Cast the voices** — one voice ID per scene partner, pre-filled with stock
   voices. Your own ElevenLabs library is offered as suggestions when a key is
   present.
4. **Pick how it runs** — advance on keypress, or advance when you stop
   speaking. Auto mode adds three dials: how long to hold on a stage
   direction, how long to wait after you stop talking, and a live mic meter
   for setting the level that counts as talking.
5. **Render once** — each partner line is rendered to MP3 and cached on disk.
   Changing a voice invalidates only that part's lines.
6. **Run the scene** — one lit page at a time, your lines under a highlighter,
   everyone else's spoken aloud.

## Setup

```bash
npm install
cp .env.example .env.local   # add your two keys
npm run dev
```

Required environment variables:

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Script breakdown |
| `ELEVENLABS_API_KEY` | Scene-partner voices |

Optional:

| Variable | Default | Purpose |
|---|---|---|
| `ANTHROPIC_MODEL` | `claude-opus-5` | Model used for the breakdown |
| `ELEVENLABS_MODEL_ID` | `eleven_v3` | Falls back to `eleven_multilingual_v2` if the account can't reach v3 |
| `DATA_DIR` | `data` | SQLite file and rendered audio, relative to the project root |

No keys to hand? `npm run seed` loads a short demo scene so you can walk the
setup and rehearsal screens — the voices just won't render.

Everything is local: `data/rehearse.db` holds the scripts and sessions,
`data/audio/` holds the rendered MP3s. Delete the folder to start clean.

## Keys during a run

| Key | Does |
|---|---|
| `Space` / `→` / `Enter` | Next beat (and starts the scene from standby) |
| `←` | Previous beat |
| `P` | Hold / resume |

## How it's put together

```
src/lib/extract.ts      PDF (unpdf) / DOCX (mammoth) / plain text → clean text
src/lib/parse.ts        the breakdown prompt + Claude call + tolerant JSON read
src/lib/elevenlabs.ts   text-to-speech, voice list, v3 → v2 fallback
src/lib/db.ts           node:sqlite schema
src/lib/store.ts        every query the routes need
src/lib/mic.ts          shared mic plumbing: level curve, thresholds, poll rate
src/lib/pacing.ts       how long a stage direction stays up
src/lib/useSilence.ts   mic RMS watcher: waits for speech, then for silence
src/components/         Intake, Setup, MicCheck, Sides, Teleprompter
```

API routes are thin wrappers over `store.ts`:

| Route | |
|---|---|
| `POST /api/scripts` | upload or paste → script id |
| `POST /api/scripts/[id]/parse` | run the breakdown |
| `GET/PATCH /api/sessions/[id]` | session state (part, mode, voices, position) |
| `POST /api/sessions/[id]/clips` | render one line — idempotent, safe to retry |
| `GET /api/audio/[sessionId]/[turnId]` | serve a rendered clip |
| `GET /api/voices` | the account's ElevenLabs voices, for suggestions |

Clip rendering is driven from the client with a pool of three, so progress is
visible per line and a failure only costs that line.

## Mic and pacing

"Advance on silence" needs to know what counts as your voice, and that depends
on the room. **Your mic** in setup shows a live level meter with a draggable
line: under it is room noise, over it counts as talking, and the readout uses
the same words and colours the teleprompter will ("Hearing you", tally red).
**Take room tone** listens for two seconds and puts the line just above your
room — the film-set move. If the input is silent it refuses and says so rather
than setting a line that would treat everything as speech.

Both audio loops poll on `setInterval`, not `requestAnimationFrame`: rAF is
throttled or paused when a tab isn't frontmost, which would stall silence
detection mid-scene.

Stage directions aren't spoken, so **Hold on directions** sets how long they
stay up. Longer directions get proportionally more time, capped at double the
setting so one wordy paragraph can't stall the scene.

## Design notes

The palette and type come from the actor's own materials, not a brand: a dark
stage, one page under the light, and a goldenrod highlighter that appears only
on lines you have to speak. Script text is set in Courier Prime — the face
screenplays are actually written in. Display type is Archivo pushed wide;
interface type is Instrument Sans. The record-red tally light appears only when
the mic is live.

## Deploying

Rehearse is built as a local, single-machine tool: SQLite on disk and rendered
MP3s in a folder next to it. That does not survive a serverless host.

On Vercel the data directory falls back to `/tmp/rehearse`, which is writable
but **per-instance and wiped on every cold start**. The site will build and the
landing page will render, but in practice a script you upload can disappear
before you finish configuring it, and audio rendered by one instance is a 404
from another. Treat a Vercel deploy as a preview of the interface, not a
working tool.

To make it actually work when hosted, two things have to move off the
filesystem:

| Today | Needs to become |
|---|---|
| `node:sqlite` file in `data/` (`src/lib/db.ts`) | a hosted Postgres or libSQL/Turso database |
| MP3s in `data/audio/` (`src/app/api/sessions/[id]/clips/route.ts`, `src/app/api/audio/...`) | object storage — Vercel Blob, S3, or R2 |

Every query is already funnelled through `src/lib/store.ts` and every file
write through those two routes, so both swaps are contained.

Run it locally (`npm run dev`) and it works exactly as designed.

## Not in this version

- Themes (colour and font sets). The token system in `globals.css` is already
  the seam for it — everything reads from `@theme`.
- Picking voices from a browsable library instead of pasting an ID.
- Recording the take. Rehearse drives the read; your camera does the rest.
- Multiple scenes per script, and trimming a long script to just your sides.
