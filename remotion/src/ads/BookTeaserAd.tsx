import {
  AbsoluteFill,
  Sequence,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { AdProps, BRAND, FONT_STACK, GRADIENT, layoutFor } from "../theme";
import { BrandBackground } from "../components/BrandBackground";
import { Caption } from "../components/Caption";
import { AdCtaOutro } from "../components/AdCtaOutro";
import { AdAudio } from "../components/AdAudio";

/**
 * Announcement teaser — "court booking is LIVE" + 3 rapid UI flashes + CTA.
 * Scenes at 0 / 60 / 120 / 180 / 240. ~14s.
 */
const VO_LINES = [
  { at: 5, file: "bt_hook" },
  { at: 128, file: "bt_mid" },
  { at: 248, file: "bt_outro" },
];

const HookScene: React.FC<{ aspect: AdProps["aspect"] }> = ({ aspect }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lay = layoutFor(aspect);
  const pop = spring({ frame, fps, config: { damping: 12, stiffness: 160 } });
  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        gap: 30 * lay.fontScale,
        padding: lay.pad,
      }}
    >
      <div
        style={{
          fontFamily: FONT_STACK,
          fontWeight: 900,
          fontSize: 74 * lay.fontScale,
          color: "#fff",
          textAlign: "center",
          transform: `scale(${0.8 + pop * 0.2})`,
          opacity: pop,
          textShadow: "0 4px 30px rgba(0,0,0,0.35)",
        }}
      >
        Court booking
        <br />
        <span style={{ color: BRAND.gold }}>is LIVE</span>
      </div>
      <Caption text="Pick. Pay. Play." size={38 * lay.fontScale} tone="gold" from={20} />
    </AbsoluteFill>
  );
};

/** One rapid UI flash — venue card → slot chip → confirmed check. */
const FlashScene: React.FC<{
  aspect: AdProps["aspect"];
  kind: "venue" | "slot" | "confirm";
}> = ({ aspect, kind }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lay = layoutFor(aspect);
  const pop = spring({ frame, fps, config: { damping: 11, stiffness: 190 } });
  const label =
    kind === "venue" ? "🏸 Siklab Pickleball Club" :
    kind === "slot" ? "13:00–14:00 · Arena Court 1" :
    "✓ Confirmed — BK-2026-0100";
  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        padding: lay.pad,
      }}
    >
      <div
        style={{
          fontFamily: FONT_STACK,
          fontWeight: 800,
          fontSize: kind === "confirm" ? 40 : 44 * lay.fontScale,
          background:
            kind === "venue" ? "#fff" : kind === "slot" ? GRADIENT : "rgba(34,197,94,0.18)",
          border:
            kind === "venue" ? "none" : kind === "slot" ? "none" : `3px solid ${BRAND.good}`,
          borderRadius: 999,
          padding: `${22 * lay.fontScale}px ${44 * lay.fontScale}px`,
          transform: `scale(${pop})`,
          opacity: pop,
          boxShadow: "0 16px 44px rgba(0,0,0,0.35)",
          color: kind === "venue" ? BRAND.ink : kind === "slot" ? "#fff" : BRAND.good,
        }}
      >
        {label}
      </div>
    </AbsoluteFill>
  );
};

export const BookTeaserAd: React.FC<AdProps> = ({ aspect, voiceoverFile }) => (
  <AbsoluteFill>
    <BrandBackground />
    <Sequence durationInFrames={60}>
      <HookScene aspect={aspect} />
    </Sequence>
    <Sequence from={60} durationInFrames={60}>
      <FlashScene aspect={aspect} kind="venue" />
    </Sequence>
    <Sequence from={120} durationInFrames={60}>
      <FlashScene aspect={aspect} kind="slot" />
    </Sequence>
    <Sequence from={180} durationInFrames={60}>
      <FlashScene aspect={aspect} kind="confirm" />
    </Sequence>
    <Sequence from={240} durationInFrames={180}>
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <AdCtaOutro
          tagline="Your next game is one tap away."
          cta="dinkmatch.club/book"
          scale={layoutFor(aspect).fontScale}
        />
      </AbsoluteFill>
    </Sequence>
    <AdAudio lines={VO_LINES} voiceoverFile={voiceoverFile} />
  </AbsoluteFill>
);
