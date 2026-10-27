# Voiceover Guide — DinkMatch Ads

Hard-won conventions for ad VO in this project. Read before touching
`scripts/gen-vo.mjs` or VO cues in `src/ads/*.tsx`.

## Voice: human, not robotic

- **Ads use the Natural multilingual voice:**
  `en-US-AndrewMultilingualNeural` — conversational delivery, real pauses,
  pitch movement. The flat `en-US-AndrewNeural` reads like a product spec.
- Per-line `voice`/`rate` overrides are supported in `gen-vo.mjs`
  (see the `bs_*` lines). Global fallback is AndrewNeural for older ads;
  new ads should opt into the Natural voice.
- Alternates: `en-US-BrianMultilingualNeural` (more casual),
  `en-US-AvaMultilingualNeural` (female read).
- For true ad-read quality beyond edge-tts: ElevenLabs —
  `ELEVENLABS_API_KEY=... node scripts/gen-vo-el.mjs [line names...]`.
  Same `vo-lines.mjs` source and `public/vo/*.mp3` outputs; optional
  `ELEVENLABS_VOICE_ID` / `ELEVENLABS_MODEL` overrides.

## Copy: spoken ad-speak

Write lines a person would say, not feature documentation:

| Don't | Do |
|---|---|
| "Put your open play on the big screen." | "Okay — picture this. Your whole open play, up on the big screen." |
| "The amber pulse indicates your match." | "See that amber glow? That's you." |

Conversational openers ("Okay —", "Big news —"), contractions, short
sentences, second person. Em-dashes buy natural TTS pauses.

## Timing: measure, never guess

- Cue spacing must come from **measured MP3 durations**, not estimates —
  spacing cues ~70f apart on a 114f line caused overlapping narration.
- Regenerate + measure:

  ```bash
  node scripts/gen-vo.mjs
  node -e "const m=require('mutagen'); ..." # or ffprobe -show_entries format=duration
  ```

- Space cues so each line fully clears before the next starts; keep a
  ~10-15f buffer.
- Natural delivery is ~15% slower than flat Neural — expect longer lines
  and grow `durationInFrames` if the last line would clip
  (BigScreen needed 660f vs the standard 540f).
- Ensure the final VO cue + its measured duration ends inside the comp.

## Pipeline

1. Edit lines in `gen-vo.mjs` (filename keys must match `VO_LINES`
  in the ad component).
2. `node scripts/gen-vo.mjs` → `public/vo/*.mp3`.
3. Measure durations, retime cues in the ad's `VO`/SFX constants.
4. Commit the `.mp3` files — they're build inputs for renders.
