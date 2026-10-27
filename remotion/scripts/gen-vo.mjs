/**
 * Generates per-scene voiceover lines via edge-tts (neural voice) into
 * public/vo/. One mp3 per line so each line can be scheduled at the exact
 * frame its scene starts — keeps narration in sync with visuals.
 *
 *   pip install edge-tts
 *   node scripts/gen-vo.mjs
 *
 * Change voice/rate below; frame markers are in src/ads/*.tsx VO_LINES.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { LINES } from "./vo-lines.mjs";

const VOICE = "en-US-AndrewNeural";
const RATE = "+8%";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "../public/vo");

const wanted = process.argv.slice(2);
const entries = Object.entries(LINES).filter(
  ([name]) => wanted.length === 0 || wanted.includes(name),
);

mkdirSync(OUT, { recursive: true });
for (const [name, line] of entries) {
  const file = join(OUT, `${name}.mp3`);
  const text = typeof line === "string" ? line : line.text;
  const rate = typeof line === "string" ? RATE : (line.rate ?? RATE);
  const voice = typeof line === "string" ? VOICE : (line.voice ?? VOICE);
  execFileSync(
    "python",
    [
      "-m",
      "edge_tts",
      "--voice",
      voice,
      `--rate=${rate}`,
      "--text",
      text,
      "--write-media",
      file,
    ],
    { stdio: "inherit" },
  );
  console.log(`wrote vo/${name}.mp3`);
}
