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
  // DuprOfficial announcement (scenes at 0 / 90 / 210 / 330)
  du_hook: "Big news — DinkMatch is officially connected to DUPR.",
  du_connect: "Link your DUPR account once.",
  du_submit: "Play open play. Your Queue Master submits in one tap.",
  du_cta: "Your DUPR rating updates automatically. Every game counts.",
  // QueueGuide tutorial (scenes at 0 / 60 / 165 / 270 / 375 / 480 / 585)
  qg_intro: "Playing open play? Here's how it works.",
  qg_s1: "Step one. Check in with your club admin to join the queue.",
  qg_s2: "Step two. Watch the live queue and track your spot.",
  qg_s3: "Step three. The app calls your court when it's your turn.",
  qg_s4: "Step four. Report the score to your Queue Master.",
  qg_s5: {
    text: "Step five. Done for the day? Ask the Queue Master to check you out.",
    rate: "+0%",
  },
  qg_outro: "Organized queue. Fair play. More games. Powered by DinkMatch.",
};

mkdirSync(OUT, { recursive: true });
for (const [name, line] of Object.entries(LINES)) {
  const file = join(OUT, `${name}.mp3`);
  const text = typeof line === "string" ? line : line.text;
  const rate = typeof line === "string" ? RATE : (line.rate ?? RATE);
  execFileSync(
    "python",
    [
      "-m",
      "edge_tts",
      "--voice",
      VOICE,
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
