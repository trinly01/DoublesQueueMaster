import {
  AbsoluteFill,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { AdProps, BRAND, FONT_STACK, layoutFor } from "../theme";
import { BrandBackground } from "../components/BrandBackground";
import { Caption } from "../components/Caption";
import { PlayerChip } from "../components/PlayerChip";
import { CourtMatchCard } from "../components/CourtMatchCard";
import { AdCtaOutro } from "../components/AdCtaOutro";
import { AdAudio, Sfx } from "../components/AdAudio";

const MODES = ["Casual", "Social", "Standard", "Competitive", "Pro Pick"];

/** Voiceover lines scheduled at each scene's start frame (see gen-vo.mjs). */
const VO_LINES = [
  { at: 5, file: "wp_hook" },
  { at: 95, file: "wp_draft" },
  { at: 245, file: "wp_modes" },
  { at: 365, file: "wp_cta" },
];

/** Beat 1 (0–3s): paddle rack — one paddle "walks" the queue. */
const RackScene: React.FC<{ aspect: AdProps["aspect"] }> = ({ aspect }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lay = layoutFor(aspect);
  // Rex the advanced paddle "walks" 2 slots — fast spring dart w/ overshoot.
  // Cartoon physics: anticipation pull-back (f10–19), then the launch.
  const pullBack = interpolate(frame, [10, 19], [0, 0.14], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const sneakP = spring({
    frame: frame - 19,
    fps,
    config: { damping: 10, stiffness: 170, mass: 0.8 },
  });
  const sneak = sneakP * 2 - pullBack; // slot units: overshoots past 0, settles
  // Squash & stretch: stretch while darting, squash pulse on land.
  const moving = interpolate(frame, [19, 26, 44, 55], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const landing = interpolate(frame, [52, 58, 68], [0, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const stretchX = 1 + moving * 0.18 - landing * 0.16;
  const stretchY = 1 - moving * 0.11 - landing * 0.09;
  const sneakRot = moving * -7 + landing * 4;
  const names = [
    { name: "Ben", skill: "beginner" as const },
    { name: "Mia", skill: "intermediate" as const },
    { name: "Rex", skill: "advanced" as const },
    { name: "Al", skill: "advanced" as const },
  ];
  // Rex slides from index 2 to index 0.
  const order = [...names];
  return (
    <AbsoluteFill
      style={{
        padding: lay.pad,
        justifyContent: "center",
        alignItems: "center",
        gap: 40 * lay.fontScale,
      }}
    >
      <Caption
        text={"Tired of\n“walking paddle” magic? 😅"}
        size={58 * lay.fontScale}
      />
      <div
        style={{
          background: "rgba(255,255,255,0.10)",
          border: "2px dashed rgba(255,255,255,0.4)",
          borderRadius: 24,
          padding: "26px 34px",
          display: "flex",
          flexDirection: "column",
          gap: 18,
          minWidth: lay.isVertical ? 760 : 640,
        }}
      >
        <div
          style={{
            color: "rgba(255,255,255,0.75)",
            fontFamily: FONT_STACK,
            fontWeight: 700,
            fontSize: 24 * lay.fontScale,
            letterSpacing: 1.5,
            textTransform: "uppercase",
          }}
        >
          Paddle rack · next up →
        </div>
        <div
          style={{
            position: "relative",
            height: 90,
            width: 4 * 200 * lay.fontScale,
          }}
        >
          {order.map((p, i) => {
            const isSneak = p.name === "Rex";
            // bumped chips each step right ONE slot, staggered as Rex passes:
            // Mia (i=1) gets bumped first, Ben (i=0) when Rex takes the front.
            const bump = isSneak
              ? 0
              : i < 2
                ? Math.min(Math.max((sneak - (1.2 - i * 0.7)) * 1.5, 0), 1)
                : 0;
            const slot = isSneak ? 2 - sneak : i + bump;
            return (
              <div
                key={p.name}
                style={{
                  position: "absolute",
                  left: slot * 200 * lay.fontScale,
                  top: isSneak ? -10 : 0,
                  transform: isSneak
                    ? `scale(${stretchX}, ${stretchY}) rotate(${sneakRot}deg)`
                    : "none",
                  transformOrigin: "50% 100%",
                  zIndex: isSneak ? 2 : 1,
                }}
              >
                <PlayerChip
                  name={p.name}
                  skill={p.skill}
                  size={64 * lay.fontScale}
                />
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** Beat 2 (3–8s): old FIFO blowout vs DinkMatch balanced draft. */
const SplitScene: React.FC<{ aspect: AdProps["aspect"] }> = ({ aspect }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lay = layoutFor(aspect);
  const pop = spring({ frame, fps, config: { damping: 15, stiffness: 120 } });
  const drafted = interpolate(frame, [20, 55], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const cardW = lay.isVertical ? "92%" : 560;
  return (
    <AbsoluteFill
      style={{
        padding: lay.pad,
        flexDirection: lay.splitDirection,
        justifyContent: "center",
        alignItems: "center",
        gap: 34,
      }}
    >
      <div
        style={{
          width: cardW,
          transform: `translateY(${(1 - pop) * 40}px)`,
          opacity: pop,
          filter: "grayscale(0.4)",
        }}
      >
        <CourtMatchCard
          label="Court 1 — FIFO rack"
          teamA={[
            { name: "Rex", skill: "advanced" },
            { name: "Ben", skill: "beginner" },
          ]}
          teamB={[
            { name: "Al", skill: "advanced" },
            { name: "Kim", skill: "beginner" },
          ]}
          caption="Same winners. 11–1 blowout again."
          captionTone="bad"
          scale={lay.isVertical ? 1.15 : 0.95}
        />
      </div>
      <div
        style={{
          width: cardW,
          transform: `scale(${0.92 + drafted * 0.08})`,
          opacity: drafted,
          boxShadow: `0 0 0 ${drafted * 5}px ${BRAND.gold}`,
          borderRadius: 24,
        }}
      >
        <CourtMatchCard
          label="Court 1 — DinkMatch"
          mode="Standard"
          teamA={[
            { name: "Rex", skill: "advanced", rating: 1740 },
            { name: "Kim", skill: "beginner", rating: 1310 },
          ]}
          teamB={[
            { name: "Al", skill: "advanced", rating: 1690 },
            { name: "Mia", skill: "intermediate", rating: 1420 },
          ]}
          winProbA={52}
          caption="Balanced 52/48 — a real game."
          captionTone="good"
          scale={lay.isVertical ? 1.15 : 0.95}
        />
      </div>
    </AbsoluteFill>
  );
};

/** Beat 3 (8–12s): mode pills cycle + priority line. */
const ModesScene: React.FC<{ aspect: AdProps["aspect"] }> = ({ aspect }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lay = layoutFor(aspect);
  const active = Math.min(MODES.length - 1, Math.floor(frame / 22));
  const pop = spring({ frame, fps, config: { damping: 16, stiffness: 140 } });
  return (
    <AbsoluteFill
      style={{
        padding: lay.pad,
        justifyContent: "center",
        alignItems: "center",
        gap: 44 * lay.fontScale,
        opacity: pop,
      }}
    >
      <Caption text="Five ways to play" size={56 * lay.fontScale} />
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 18,
          justifyContent: "center",
          maxWidth: lay.isVertical ? 900 : 1100,
        }}
      >
        {MODES.map((m, i) => {
          const on = i <= active;
          const isActive = i === active;
          // wet-dog shake: decaying rotation wiggle on activation
          const local = frame - i * 22;
          const shake =
            local > 0 && local < 18
              ? Math.sin(local * 0.85) * Math.exp(-local / 7) * 9
              : 0;
          const squash =
            local > 0 && local < 18
              ? Math.abs(Math.sin(local * 0.85)) * Math.exp(-local / 9) * 0.1
              : 0;
          return (
            <div
              key={m}
              style={{
                fontFamily: FONT_STACK,
                fontWeight: 800,
                fontSize: 30 * lay.fontScale,
                borderRadius: 999,
                padding: `${14 * lay.fontScale}px ${30 * lay.fontScale}px`,
                background: on ? "#fff" : "rgba(255,255,255,0.14)",
                color: on ? BRAND.purpleTo : "rgba(255,255,255,0.8)",
                transform: `scale(${isActive ? 1.12 + squash : 1 + squash}, ${isActive ? 1.12 - squash : 1 - squash * 0.5}) rotate(${shake}deg)`,
                boxShadow: on ? `0 8px 24px rgba(0,0,0,0.25)` : "none",
                border: on
                  ? `3px solid ${BRAND.gold}`
                  : "3px solid transparent",
              }}
            >
              {m}
            </div>
          );
        })}
      </div>
      <Caption
        from={55}
        text="Fewest games played goes first — fair for everyone."
        size={40 * lay.fontScale}
        tone="gold"
      />
      <Caption
        from={75}
        text="🔊 Voice calls the court — no shouting names."
        size={34 * lay.fontScale}
      />
    </AbsoluteFill>
  );
};

export const WalkingPaddleAd: React.FC<AdProps> = ({
  aspect,
  voiceoverFile,
}) => (
  <AbsoluteFill>
    <BrandBackground />
    <Sequence durationInFrames={90}>
      <RackScene aspect={aspect} />
    </Sequence>
    <Sequence from={90} durationInFrames={150}>
      <SplitScene aspect={aspect} />
    </Sequence>
    <Sequence from={240} durationInFrames={120}>
      <ModesScene aspect={aspect} />
    </Sequence>
    <Sequence from={360} durationInFrames={180}>
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <AdCtaOutro
          tagline="Open play, the way it should be."
          scale={layoutFor(aspect).fontScale}
        />
      </AbsoluteFill>
    </Sequence>
    {/* rack: anticipation → dart whoosh → land thud */}
    <Sfx at={19} file="whoosh" volume={0.55} />
    <Sfx at={52} file="dink" volume={0.6} />
    {/* split: cards pop in, win-prob bar fills */}
    <Sfx at={95} file="dink" volume={0.7} />
    <Sfx at={110} file="dink" volume={0.8} />
    <Sfx at={135} file="tick" volume={0.7} />
    {/* modes: one tick per pill activation (240 + i*22) */}
    <Sfx at={240} file="tick" volume={0.6} />
    <Sfx at={262} file="tick" volume={0.6} />
    <Sfx at={284} file="tick" volume={0.6} />
    <Sfx at={306} file="tick" volume={0.6} />
    <Sfx at={328} file="tick" volume={0.6} />
    {/* outro */}
    <Sfx at={370} file="win" />
    <AdAudio lines={VO_LINES} voiceoverFile={voiceoverFile} />
  </AbsoluteFill>
);
