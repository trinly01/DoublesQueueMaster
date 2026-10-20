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
import { AdCtaOutro } from "../components/AdCtaOutro";
import { AdAudio, Sfx } from "../components/AdAudio";

/** Voiceover lines scheduled at each scene's start (see gen-vo.mjs). */
const VO_LINES = [
  { at: 5, file: "egc_hook" },
  { at: 95, file: "egc_rating" },
  { at: 215, file: "egc_duo" },
  { at: 335, file: "egc_cta" },
];

/** Beat 1 (0–3s): 11–9 clutch score + gold badge. */
const ClutchScene: React.FC<{ aspect: AdProps["aspect"] }> = ({ aspect }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lay = layoutFor(aspect);
  const slam = spring({ frame, fps, config: { damping: 9, stiffness: 200 } });
  const badge = spring({
    frame: frame - 22,
    fps,
    config: { damping: 10, stiffness: 240 },
  });
  return (
    <AbsoluteFill
      style={{
        padding: lay.pad,
        justifyContent: "center",
        alignItems: "center",
        gap: 48 * lay.fontScale,
      }}
    >
      <Caption
        text="What if every open-play game counted?"
        size={50 * lay.fontScale}
      />
      <div style={{ position: "relative", transform: `scale(${slam})` }}>
        <div
          style={{
            background: "#fff",
            borderRadius: 28,
            padding: `${30 * lay.fontScale}px ${70 * lay.fontScale}px`,
            fontFamily: FONT_STACK,
            fontWeight: 900,
            fontSize: 120 * lay.fontScale,
            color: BRAND.ink,
            letterSpacing: 2,
            boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            gap: 30 * lay.fontScale,
          }}
        >
          <span>11</span>
          <span style={{ color: BRAND.grey, fontSize: 60 * lay.fontScale }}>
            –
          </span>
          <span>9</span>
        </div>
        <div
          style={{
            position: "absolute",
            top: -34 * lay.fontScale,
            right: -26 * lay.fontScale,
            background: BRAND.gold,
            color: BRAND.ink,
            fontFamily: FONT_STACK,
            fontWeight: 900,
            fontSize: 26 * lay.fontScale,
            borderRadius: 999,
            padding: `${10 * lay.fontScale}px ${22 * lay.fontScale}px`,
            transform: `scale(${badge}) rotate(-8deg)`,
            opacity: badge,
            boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
          }}
        >
          ⚡ CLUTCH WIN
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** Beat 2 (3–7s): rating counter ticks up with sparkline. */
const RatingScene: React.FC<{ aspect: AdProps["aspect"] }> = ({ aspect }) => {
  const frame = useCurrentFrame();
  const lay = layoutFor(aspect);
  const rating = Math.round(
    interpolate(frame, [10, 90], [1450, 1478], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );
  const tier = rating >= 1470 ? "Intermediate ↑" : "Intermediate";
  // fake sparkline points
  const pts = [12, 18, 14, 26, 22, 34, 30, 44, 40, 58];
  const w = lay.isVertical ? 760 : 620;
  const h = 170;
  const drawn = interpolate(frame, [0, 80], [0, pts.length - 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const path = pts
    .slice(0, Math.ceil(drawn) + 1)
    .map((v, i) => `${(i / (pts.length - 1)) * w},${h - (v / 60) * h}`)
    .join(" L ");
  return (
    <AbsoluteFill
      style={{
        padding: lay.pad,
        justifyContent: "center",
        alignItems: "center",
        gap: 40 * lay.fontScale,
      }}
    >
      <Caption text="Your rating earns itself" size={52 * lay.fontScale} />
      <div
        style={{
          background: "#fff",
          borderRadius: 24,
          padding: 34 * lay.fontScale,
          width: w,
          boxShadow: "0 16px 44px rgba(0,0,0,0.28)",
          fontFamily: FONT_STACK,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 18,
            marginBottom: 8,
          }}
        >
          <span
            style={{
              fontWeight: 900,
              fontSize: 88 * lay.fontScale,
              color: BRAND.purpleTo,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {rating}
          </span>
          <span
            style={{
              fontWeight: 800,
              fontSize: 26 * lay.fontScale,
              color: BRAND.good,
            }}
          >
            {tier}
          </span>
        </div>
        <svg width={w} height={h}>
          <path
            d={`M ${path}`}
            fill="none"
            stroke={BRAND.purpleFrom}
            strokeWidth={6}
            strokeLinecap="round"
          />
        </svg>
        <div
          style={{
            color: BRAND.grey,
            fontWeight: 600,
            fontSize: 24 * lay.fontScale,
            marginTop: 6,
          }}
        >
          Fair partner-weighted Elo — score margin counts.
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** Beat 3 (7–11s): Best Duo leaderboard + profile tabs. */
const LeaderboardScene: React.FC<{ aspect: AdProps["aspect"] }> = ({
  aspect,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lay = layoutFor(aspect);
  const duos = [
    { pair: "Rex & Al", score: "92%", tag: "🔥 Hot form" },
    { pair: "Mia & Ben", score: "88%", tag: "⚡ Synergy" },
    { pair: "Kim & Jo", score: "81%", tag: "📈 Climbing" },
  ];
  return (
    <AbsoluteFill
      style={{
        padding: lay.pad,
        justifyContent: "center",
        alignItems: "center",
        gap: 36 * lay.fontScale,
      }}
    >
      <Caption text="Best Duo leaderboard" size={52 * lay.fontScale} />
      <div
        style={{
          background: "#fff",
          borderRadius: 24,
          padding: 10 * lay.fontScale,
          width: lay.isVertical ? 820 : 680,
          boxShadow: "0 16px 44px rgba(0,0,0,0.28)",
          fontFamily: FONT_STACK,
        }}
      >
        {duos.map((d, i) => {
          const p = spring({
            frame: frame - 8 - i * 8,
            fps,
            config: { damping: 15, stiffness: 170 },
          });
          return (
            <div
              key={d.pair}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 18 * lay.fontScale,
                padding: `${18 * lay.fontScale}px ${22 * lay.fontScale}px`,
                borderBottom: i < 2 ? "1px solid #eee" : "none",
                transform: `translateX(${(1 - p) * 60}px)`,
                opacity: p,
              }}
            >
              <span
                style={{
                  fontWeight: 900,
                  fontSize: 26 * lay.fontScale,
                  color: BRAND.purpleTo,
                  width: 40,
                }}
              >
                #{i + 1}
              </span>
              <span
                style={{
                  fontWeight: 800,
                  fontSize: 28 * lay.fontScale,
                  color: BRAND.ink,
                  flex: 1,
                }}
              >
                {d.pair}
              </span>
              <span style={{ fontSize: 26 * lay.fontScale }}>{d.tag}</span>
              <span
                style={{
                  fontWeight: 900,
                  fontSize: 28 * lay.fontScale,
                  color: BRAND.good,
                }}
              >
                {d.score}
              </span>
            </div>
          );
        })}
      </div>
      <div
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        {["Rating", "Matches", "Partners", "Rivals", "Clutch"].map((t) => (
          <span
            key={t}
            style={{
              fontFamily: FONT_STACK,
              fontWeight: 700,
              fontSize: 24 * lay.fontScale,
              color: "#fff",
              background: "rgba(255,255,255,0.16)",
              borderRadius: 999,
              padding: `${7 * lay.fontScale}px ${18 * lay.fontScale}px`,
            }}
          >
            {t}
          </span>
        ))}
      </div>
    </AbsoluteFill>
  );
};

/** Beat 4 (11–15s): DUPR connected + CTA. */
const DuprScene: React.FC<{ aspect: AdProps["aspect"] }> = ({ aspect }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lay = layoutFor(aspect);
  const pop = spring({
    frame: frame - 10,
    fps,
    config: { damping: 12, stiffness: 170 },
  });
  return (
    <AbsoluteFill
      style={{
        padding: lay.pad,
        justifyContent: "center",
        alignItems: "center",
        gap: 34 * lay.fontScale,
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 999,
          padding: `${16 * lay.fontScale}px ${40 * lay.fontScale}px`,
          fontFamily: FONT_STACK,
          fontWeight: 800,
          fontSize: 32 * lay.fontScale,
          color: "#1e3a8a",
          transform: `scale(${pop})`,
          opacity: pop,
          boxShadow: "0 12px 34px rgba(0,0,0,0.28)",
          display: "flex",
          alignItems: "center",
          gap: 14 * lay.fontScale,
        }}
      >
        ✓ DUPR connected — 1-tap sync
      </div>
      <AdCtaOutro
        tagline="Track your rise."
        cta="Start free"
        scale={lay.fontScale}
      />
    </AbsoluteFill>
  );
};

export const EveryGameCountsAd: React.FC<AdProps> = ({
  aspect,
  voiceoverFile,
}) => (
  <AbsoluteFill>
    <BrandBackground />
    <Sequence durationInFrames={90}>
      <ClutchScene aspect={aspect} />
    </Sequence>
    <Sequence from={90} durationInFrames={120}>
      <RatingScene aspect={aspect} />
    </Sequence>
    <Sequence from={210} durationInFrames={120}>
      <LeaderboardScene aspect={aspect} />
    </Sequence>
    <Sequence from={330} durationInFrames={210}>
      <DuprScene aspect={aspect} />
    </Sequence>
    {/* score slam + clutch badge */}
    <Sfx at={8} file="dink" />
    <Sfx at={30} file="chime" volume={0.6} />
    {/* rating counter climbs 100–180 — rhythmic ticks */}
    <Sfx at={100} file="tick" volume={0.5} />
    <Sfx at={120} file="tick" volume={0.5} />
    <Sfx at={140} file="tick" volume={0.5} />
    <Sfx at={160} file="tick" volume={0.5} />
    <Sfx at={175} file="tick" volume={0.6} />
    {/* leaderboard: each row slides in */}
    <Sfx at={218} file="click" volume={0.5} />
    <Sfx at={226} file="click" volume={0.5} />
    <Sfx at={234} file="click" volume={0.5} />
    {/* DUPR pill + outro */}
    <Sfx at={340} file="chime" volume={0.7} />
    <Sfx at={400} file="win" volume={0.8} />
    <AdAudio lines={VO_LINES} voiceoverFile={voiceoverFile} />
  </AbsoluteFill>
);
