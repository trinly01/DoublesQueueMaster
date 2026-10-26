/**
 * Renders ad compositions to MP4.
 *   node scripts/render-all.mjs                — all 9 → ./out/
 *   node scripts/render-all.mjs 9x16           — only matching ids
 *   node scripts/render-all.mjs all ../public/ads   — custom output dir
 *     (e.g. the app's public/ads/ so videos ship with the PWA at /ads/*.mp4)
 */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const ADS = [
  "WalkingPaddle",
  "ZeroPolitics",
  "EveryGameCounts",
  "QueueGuide",
  "DuprOfficial",
  "BigScreen",
  "Modes",
];
const RATIOS = ["9x16", "1x1", "16x9"];

const filter = process.argv[2];
const outDir = process.argv[3] ?? "out";
const ids = ADS.flatMap((ad) => RATIOS.map((r) => `${ad}-${r}`)).filter(
  (id) => !filter || filter === "all" || id.includes(filter),
);

mkdirSync(outDir, { recursive: true });
for (const id of ids) {
  console.log(`\n=== rendering ${id} ===`);
  execFileSync(
    "npx",
    ["remotion", "render", id, join(outDir, `${id}.mp4`), "--port=3111"],
    {
      stdio: "inherit",
      shell: process.platform === "win32",
    },
  );
}
console.log(`\nDone — ${ids.length} video(s) in ${outDir}`);
