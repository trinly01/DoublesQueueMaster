---
name: profile
---

# User Preferences

## Git commits

- NEVER include the "Generated with [Devin](https://devin.ai)" line or the "Co-Authored-By: Devin" trailer in commit messages. Write commit messages as if the user wrote them directly.
- The shell is PowerShell on Windows. Heredoc syntax (`<<'EOF'`) does not work — write the commit message to a temp file and use `git commit -F <file>` instead.

## Ad voiceovers (Remotion)

- Human tone, not robotic. Use `en-US-AndrewMultilingualNeural` (Natural tier) via per-line `voice` overrides in `remotion/scripts/gen-vo.mjs` — never the flat AndrewNeural for new ads.
- Write spoken ad-speak, not feature docs ("Okay — picture this." / "See that amber glow? That's you.").
- Space VO cues by measured MP3 durations, never estimates — lines overlap otherwise. Grow `durationInFrames` so the last line doesn't clip.
- Full guide: `remotion/docs/VO_GUIDE.md`.
