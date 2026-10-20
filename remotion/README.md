# DinkMatch Ad Studio (Remotion)

Programmatic video ads for DinkMatch — built with Remotion 4.0.537 + Tailwind.
Three 15-second ads, each registered in **9:16** (Reels/TikTok/Shorts),
**1:1** (FB/IG feed), and **16:9** (YouTube/web) — 9 compositions total.

## Quick start

```bash
cd remotion
npm install
npm run dev        # opens Remotion Studio — scrub all 9 comps live
```

## Compositions

| ID prefix           | Hook                                        | Beats                                                              |
| ------------------- | ------------------------------------------- | ------------------------------------------------------------------ |
| `WalkingPaddle-*`   | "Tired of walking-paddle magic?"            | rack manipulation → FIFO blowout vs balanced draft → 5 modes → CTA |
| `ZeroPolitics-*`    | "Open play shouldn't feel like refereeing." | organizer chaos → Lock 🔒 / Fixed Duo 🔗 / discreet Avoid 🚫 → CTA |
| `EveryGameCounts-*` | "What if every game counted?"               | 11–9 clutch → live Elo climb → Best Duo leaderboard → DUPR → CTA   |

Suffixes: `-9x16`, `-1x1`, `-16x9` (e.g. `WalkingPaddle-9x16`).

## Rendering

```bash
npm run render:all      # all 9 MP4s → remotion/out/
npm run render:reels    # only the 9:16 verticals
npm run render:feed     # only 1:1
npm run render:yt       # only 16:9
npm run render:public   # all 9 → ../public/ads/ (ships with the app at /ads/*.mp4)
npx remotion render WalkingPaddle-9x16 out/one.mp4   # single comp
```

> `render:public` copies MP4s into the app's `public/ads/` so they're served
> by the site/PWA and get committed to the repo — good for embedding on the
> landing page, but note each video adds repo weight. For social uploads,
> render to `out/` instead (gitignored).

## Audio

Ads are designed **sound-off first** (bold kinetic captions). Procedural SFX
cues (dink pop, whoosh, click, chime, tick, win motif) live in
`public/sfx/*.wav` — regenerate with `npm run gen:sfx`.

### Human voiceover (recommended)

Never robotic TTS on social ads. Record ~12s on your phone (authentic beats
polished) or use a human-grade voice (ElevenLabs etc.). Drop the file in
`public/vo/` and update the `vo` field in `src/Root.tsx`, or pass a prop:

**Current VO**: neural TTS via `edge-tts` (voice `en-US-AndrewNeural`,
"Warm, Confident, Authentic") — already generated to `public/vo/*.mp3` and
wired as default props in `src/Root.tsx`. To regenerate or tweak:

```bash
pip install edge-tts
python -m edge_tts --voice en-US-AndrewNeural --rate=+8% \
  --text "…script…" --write-media public/vo/ad1-walking-paddle.mp3
```

Other voices: `python -m edge_tts --list-voices` (e.g. `en-US-AvaNeural`
female). A real phone-recorded read still beats TTS — drop the file in
`public/vo/` under the same name and re-render.

```bash
npx remotion render WalkingPaddle-9x16 out/ad.mp4 --props='{"aspect":"9:16","voiceoverFile":"vo/ad1.mp3"}'
```

**Timed scripts (~12–13s each, read at natural pace):**

- **Ad 1 — WalkingPaddle:** _"Still doing the walking-paddle shuffle at open play? DinkMatch drafts fair, balanced matches automatically — five modes, zero politics. Try it free, no sign up."_
- **Ad 2 — ZeroPolitics:** _"Running open play shouldn't feel like refereeing. Lock a spot, link a duo, quietly avoid a clash — DinkMatch handles the politics so you can just play."_
- **Ad 3 — EveryGameCounts:** _"What if every open-play game counted? Real ratings, best-duo leaderboards, DUPR sync. Track your rise with DinkMatch — start free."_

## Project layout

```
src/theme.ts                 brand tokens + per-aspect layout helper
src/components/              BrandBackground, Caption, PlayerChip,
                             CourtMatchCard, AdCtaOutro, AdAudio/Sfx
src/ads/                     the 3 ad compositions
src/Root.tsx                 registers all 9 compositions
scripts/gen-sfx.mjs          procedural WAV synthesizer (no deps)
scripts/render-all.mjs       batch MP4 renderer
public/logo.png              app logo (from ../public)
public/sfx/ public/vo/       generated cues + your voiceover files
```

## Social copy

Ready-to-post captions for every ad live in
[docs/SOCIAL_COPY.md](docs/SOCIAL_COPY.md) — TikTok/Reels + Facebook
versions, hashtags, posting times, and boost order.

## License note

Remotion is free for teams of up to 3 people; larger orgs need a company
license — see https://www.remotion.pro/license.
