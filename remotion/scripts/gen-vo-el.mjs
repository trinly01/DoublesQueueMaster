/**
 * Generates ad VO via ElevenLabs — near-human ad read quality.
 * Same LINES source as gen-vo.mjs; writes the same public/vo/*.mp3 files
 * so cue timing workflow is identical (measure + retime after regen).
 *
 *   ELEVENLABS_API_KEY=... node scripts/gen-vo-el.mjs [du_hook du_cta ...]
 *
 * Env:
 *   ELEVENLABS_API_KEY  (required)
 *   ELEVENLABS_VOICE_ID (default: adam-sounding warm male read below)
 *   ELEVENLABS_MODEL    (default: eleven_multilingual_v2)
 * Pass line names as args to regen a subset — e.g. only the du_* files.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { LINES } from "./vo-lines.mjs";

const API_KEY = process.env.ELEVENLABS_API_KEY;
// "Adam" — warm, conversational male voice (ElevenLabs premade).
const VOICE_ID =
  process.env.ELEVENLABS_VOICE_ID || "pNInz6obpgDQGcFmaJgB";
const MODEL = process.env.ELEVENLABS_MODEL || "eleven_multilingual_v2";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "../public/vo");

if (!API_KEY) {
  console.error("ELEVENLABS_API_KEY is not set.");
  process.exit(1);
}

const wanted = process.argv.slice(2);
const entries = Object.entries(LINES).filter(
  ([name]) => wanted.length === 0 || wanted.includes(name),
);

mkdirSync(OUT, { recursive: true });

for (const [name, line] of entries) {
  const text = typeof line === "string" ? line : line.text;
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": API_KEY,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: MODEL,
        // Ad-read tuning: stability low enough to allow emotion,
        // style high enough for emphasis without shouting.
        voice_settings: {
          stability: 0.45,
          similarity_boost: 0.8,
          style: 0.35,
          use_speaker_boost: true,
        },
      }),
    },
  );
  if (!res.ok) {
    const body = await res.text();
    console.error(`✗ ${name}: HTTP ${res.status} — ${body.slice(0, 200)}`);
    process.exitCode = 1;
    continue;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(join(OUT, `${name}.mp3`), buf);
  console.log(`wrote vo/${name}.mp3 (${(buf.length / 1024).toFixed(0)} KB)`);
}
