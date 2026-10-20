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

const VOICE = "en-US-AndrewNeural";
const RATE = "+8%";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "../public/vo");

/** Per-scene lines — filenames must match VO_LINES in src/ads/*.tsx. */
const LINES = {
  // WalkingPaddle (scenes at 0 / 90 / 240 / 360)
  wp_hook: "Still doing the walking paddle shuffle at open play?",
  wp_draft: "DinkMatch drafts fair, balanced matches automatically.",
  wp_modes: "Five modes, zero politics.",
  wp_cta: "Try it free. No sign up.",
  // ZeroPolitics (scenes at 0 / 95 / 190 / 285 / 380)
  zp_hook: "Running open play shouldn't feel like refereeing.",
  zp_lock: "Lock a spot.",
  zp_duo: "Link a duo.",
  zp_avoid: "Quietly avoid a clash.",
  zp_cta: "DinkMatch handles the politics, so you can just play.",
  // EveryGameCounts (scenes at 0 / 90 / 210 / 330)
  egc_hook: "What if every open-play game counted?",
  egc_rating: "Real, partner-weighted ratings.",
  egc_duo: "Best-duo leaderboards.",
  egc_cta: "DUPR sync. Track your rise with DinkMatch. Start free.",
};

mkdirSync(OUT, { recursive: true });
for (const [name, text] of Object.entries(LINES)) {
  const file = join(OUT, `${name}.mp3`);
  execFileSync(
    "python",
    [
      "-m",
      "edge_tts",
      "--voice",
      VOICE,
      `--rate=${RATE}`,
      "--text",
      text,
      "--write-media",
      file,
    ],
    { stdio: "inherit" },
  );
  console.log(`wrote vo/${name}.mp3`);
}
