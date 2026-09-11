// Seeds a broken-down scene so the UI can be exercised without API keys.
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const DATA = path.join(process.cwd(), "data");
fs.mkdirSync(path.join(DATA, "audio"), { recursive: true });
const db = new DatabaseSync(path.join(DATA, "rehearse.db"));

const source = fs.readFileSync("src/lib/db.ts", "utf8");
db.exec(source.match(/const SCHEMA = `([\s\S]*?)`;/)[1]);

const rid = (p) => `${p}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;

const TURNS = [
  ["heading", null, null, "INT. LOADING DOCK — 4:50 AM"],
  ["action", null, null, "Rain on corrugated steel. MARA sits on a pallet with a thermos she hasn't opened. DEV comes down the ramp, still in yesterday's coat."],
  ["dialogue", "DEV", null, "You didn't call."],
  ["dialogue", "MARA", "not looking up", "I didn't have anything to say yet."],
  ["dialogue", "DEV", null, "That's never stopped you before."],
  ["dialogue", "MARA", null, "You read the whole thing?"],
  ["dialogue", "DEV", null, "Twice. On the train."],
  ["action", null, null, "He doesn't sit. He stays on the ramp, half in the light."],
  ["dialogue", "MARA", null, "And you still came."],
  ["dialogue", "DEV", "quietly", "I brought a pen."],
  ["dialogue", "MARA", null, "Dev — if you sign it, there's no version of Tuesday where we're still speaking."],
  ["dialogue", "DEV", null, "Then I'll take Tuesday off."],
  ["action", null, null, "She finally looks at him. Neither one moves."],
  ["dialogue", "MARA", null, "Sit down."],
];

const scriptId = rid("scr");
db.prepare(
  `INSERT INTO scripts (id,title,source_name,source_kind,raw_text,parse_status,created_at) VALUES (?,?,?,?,?,'ready',?)`,
).run(scriptId, "The Loading Dock — Sc. 14", "loading-dock-sides.pdf", "pdf", "seeded", Date.now());

const counts = {};
for (const [kind, who] of TURNS) if (kind === "dialogue") counts[who] = (counts[who] ?? 0) + 1;

const charIds = {};
Object.entries(counts)
  .sort((a, b) => b[1] - a[1])
  .forEach(([name, n], i) => {
    const id = rid("chr");
    charIds[name] = id;
    db.prepare(
      `INSERT INTO characters (id,script_id,name,ord,line_count,description) VALUES (?,?,?,?,?,?)`,
    ).run(id, scriptId, name, i, n, name === "MARA" ? "Night-shift dispatcher, mid-30s" : "Her former partner");
  });

TURNS.forEach(([kind, who, paren, text], i) => {
  db.prepare(
    `INSERT INTO turns (id,script_id,idx,kind,character_id,parenthetical,text,tts_text,tts_text_tagged,delivery)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    rid("trn"), scriptId, i, kind, who ? charIds[who] : null, paren, text,
    kind === "dialogue" ? text : null,
    kind === "dialogue" ? text : null,
    kind === "dialogue" && paren ? paren : null,
  );
});

console.log(`/script/${scriptId}`);
