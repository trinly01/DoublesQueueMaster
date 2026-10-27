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
import { CourtMatchCard } from "../components/CourtMatchCard";
import { AdCtaOutro } from "../components/AdCtaOutro";
import { AdAudio, Sfx } from "../components/AdAudio";

/** Voiceover lines scheduled at each scene's start (see gen-vo.mjs). */
// edge-tts durations ≈ hook 3.7s / connect 1.9s / submit 3.3s / cta 4.0s.
// Each line starts ~1s after the previous one ends — the pause between
// lines is what makes the beats readable.
const VO_LINES = [
  { at: 12, file: "du_hook" },
  { at: 148, file: "du_connect" },
  { at: 232, file: "du_submit" },
  { at: 362, file: "du_cta" },
];

/** Beat 1 (0–3s): DinkMatch × DUPR handshake — two pills link up. */
const HandshakeScene: React.FC<{ aspect: AdProps["aspect"] }> = ({
  aspect,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lay = layoutFor(aspect);
  const leftIn = spring({
    frame,
    fps,
    config: { damping: 12, stiffness: 180 },
  });
  const rightIn = spring({
    frame: frame - 14,
    fps,
    config: { damping: 12, stiffness: 180 },
  });
  const linkPop = spring({
    frame: frame - 34,
    fps,
    config: { damping: 9, stiffness: 220 },
  });
  const newBadge = spring({
    frame: frame - 50,
    fps,
    config: { damping: 10, stiffness: 240 },
  });
  const pill = (
    label: string,
    accent: string,
    p: number,
    dir: number,
  ): React.ReactNode => (
    <div
      style={{
        background: "#fff",
        borderRadius: 999,
        padding: `${22 * lay.fontScale}px ${44 * lay.fontScale}px`,
        fontFamily: FONT_STACK,
        fontWeight: 900,
        fontSize: 52 * lay.fontScale,
        color: accent,
        boxShadow: "0 16px 44px rgba(0,0,0,0.3)",
        transform: `translateX(${(1 - p) * 90 * dir}px) scale(${0.7 + p * 0.3})`,
        opacity: p,
      }}
    >
      {label}
    </div>
  );
  return (
    <AbsoluteFill
      style={{
        padding: lay.pad,
        justifyContent: "center",
        alignItems: "center",
        gap: 54 * lay.fontScale,
      }}
    >
      <div
        style={{
          background: BRAND.gold,
          color: BRAND.ink,
          fontFamily: FONT_STACK,
          fontWeight: 900,
          fontSize: 30 * lay.fontScale,
          borderRadius: 999,
          padding: `${12 * lay.fontScale}px ${30 * lay.fontScale}px`,
          transform: `scale(${newBadge}) rotate(-5deg)`,
          opacity: newBadge,
          boxShadow: "0 10px 28px rgba(0,0,0,0.3)",
          letterSpacing: 2,
        }}
      >
        ⚡ OFFICIAL
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 18 * lay.fontScale,
          flexDirection: lay.isVertical ? "column" : "row",
        }}
      >
        {pill("DinkMatch", BRAND.purpleTo, leftIn, -1)}
        <div
          style={{
            fontFamily: FONT_STACK,
            fontWeight: 900,
            fontSize: 64 * lay.fontScale,
            color: BRAND.good,
            transform: `scale(${linkPop})`,
            opacity: linkPop,
            textShadow: "0 6px 20px rgba(0,0,0,0.3)",
          }}
        >
          🤝
        </div>
        {pill("DUPR", "#1e3a8a", rightIn, 1)}
      </div>
      <Caption
        text="Open-play games now count for real."
        from={44}
        size={46 * lay.fontScale}
      />
    </AbsoluteFill>
  );
};

/** Beat 2 (3–7s): link your DUPR once — profile card + rating chips. */
const ConnectScene: React.FC<{ aspect: AdProps["aspect"] }> = ({ aspect }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lay = layoutFor(aspect);
  const cardIn = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 160 },
  });
  const checkPop = spring({
    frame: frame - 40,
    fps,
    config: { damping: 9, stiffness: 230 },
  });
  const chipIn = (i: number) =>
    spring({
      frame: frame - 52 - i * 9,
      fps,
      config: { damping: 13, stiffness: 190 },
    });
  const chips = [
    { label: "DUPR ID", value: "R4Q0MM" },
    { label: "Singles", value: "3.500" },
    { label: "Doubles", value: "3.240" },
  ];
  return (
    <AbsoluteFill
      style={{
        padding: lay.pad,
        justifyContent: "center",
        alignItems: "center",
        gap: 42 * lay.fontScale,
      }}
    >
      <Caption text="Link your DUPR once" size={52 * lay.fontScale} />
      <div
        style={{
          position: "relative",
          transform: `scale(${0.8 + cardIn * 0.2})`,
          opacity: cardIn,
        }}
      >
        <div
          style={{
            background: "#fff",
            borderRadius: 26,
            padding: 38 * lay.fontScale,
            width: lay.isVertical ? 780 : 640,
            boxShadow: "0 18px 50px rgba(0,0,0,0.3)",
            fontFamily: FONT_STACK,
            display: "flex",
            flexDirection: "column",
            gap: 20 * lay.fontScale,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 20 * lay.fontScale,
            }}
          >
            <div
              style={{
                width: 84 * lay.fontScale,
                height: 84 * lay.fontScale,
                borderRadius: "50%",
                background: `linear-gradient(135deg, ${BRAND.purpleFrom}, ${BRAND.purpleTo})`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontWeight: 900,
                fontSize: 36 * lay.fontScale,
              }}
            >
              AT
            </div>
            <div>
              <div
                style={{
                  fontWeight: 900,
                  fontSize: 34 * lay.fontScale,
                  color: BRAND.ink,
                }}
              >
                Alex T.
              </div>
              <div
                style={{
                  fontWeight: 600,
                  fontSize: 22 * lay.fontScale,
                  color: BRAND.grey,
                }}
              >
                @alexplays
              </div>
            </div>
          </div>
          <div
            style={{
              display: "flex",
              gap: 14 * lay.fontScale,
              flexWrap: "wrap",
            }}
          >
            {chips.map((c, i) => {
              const p = chipIn(i);
              return (
                <div
                  key={c.label}
                  style={{
                    background: "rgba(30,58,138,0.08)",
                    border: "2px solid rgba(30,58,138,0.18)",
                    borderRadius: 16,
                    padding: `${12 * lay.fontScale}px ${18 * lay.fontScale}px`,
                    transform: `translateY(${(1 - p) * 24}px)`,
                    opacity: p,
                  }}
                >
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: 18 * lay.fontScale,
                      color: BRAND.grey,
                    }}
                  >
                    {c.label}
                  </div>
                  <div
                    style={{
                      fontWeight: 900,
                      fontSize: 32 * lay.fontScale,
                      color: "#1e3a8a",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {c.value}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div
          style={{
            position: "absolute",
            top: -30 * lay.fontScale,
            right: -26 * lay.fontScale,
            background: BRAND.good,
            color: "#fff",
            fontFamily: FONT_STACK,
            fontWeight: 900,
            fontSize: 30 * lay.fontScale,
            borderRadius: 999,
            padding: `${12 * lay.fontScale}px ${26 * lay.fontScale}px`,
            transform: `scale(${checkPop})`,
            opacity: checkPop,
            boxShadow: "0 10px 28px rgba(0,0,0,0.3)",
          }}
        >
          ✓ Connected
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** Beat 3 (7–11s): completed match → one-tap submit → reported + match code. */
const SubmitScene: React.FC<{ aspect: AdProps["aspect"] }> = ({ aspect }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lay = layoutFor(aspect);
  const submitted = frame >= 55;
  const submitFlip = interpolate(frame, [50, 60], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const codePop = spring({
    frame: frame - 74,
    fps,
    config: { damping: 11, stiffness: 200 },
  });
  return (
    <AbsoluteFill
      style={{
        padding: lay.pad,
        justifyContent: "center",
        alignItems: "center",
        gap: 36 * lay.fontScale,
      }}
    >
      <Caption text="Play. Then one tap." size={52 * lay.fontScale} />
      <div style={{ width: lay.isVertical ? 840 : 720 }}>
        <CourtMatchCard
          label="Court 2 · Open Play"
          teamA={[
            { name: "Alex T.", skill: "advanced" },
            { name: "Kim R.", skill: "intermediate" },
          ]}
          teamB={[
            { name: "Ben M.", skill: "intermediate" },
            { name: "Jo S.", skill: "beginner" },
          ]}
          caption="Final — 11–7"
          captionTone="good"
          scale={lay.fontScale}
        />
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 20 * lay.fontScale,
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            background: submitted
              ? BRAND.good
              : `linear-gradient(135deg, ${BRAND.purpleFrom}, ${BRAND.purpleTo})`,
            color: "#fff",
            fontFamily: FONT_STACK,
            fontWeight: 800,
            fontSize: 30 * lay.fontScale,
            borderRadius: 999,
            padding: `${16 * lay.fontScale}px ${40 * lay.fontScale}px`,
            boxShadow: "0 12px 34px rgba(0,0,0,0.3)",
            transform: `scale(${1 + Math.sin(submitFlip * Math.PI) * 0.12})`,
          }}
        >
          {submitted ? "✓ Reported to DUPR" : "Submit to DUPR"}
        </div>
        <div
          style={{
            background: "rgba(255,255,255,0.92)",
            color: "#1e3a8a",
            fontFamily: FONT_STACK,
            fontWeight: 800,
            fontSize: 26 * lay.fontScale,
            borderRadius: 999,
            padding: `${12 * lay.fontScale}px ${28 * lay.fontScale}px`,
            transform: `scale(${codePop})`,
            opacity: codePop,
            boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          #6341519664
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** Beat 4 (11–14.5s): DUPR rating ticks up — reads "this is automatic". */
const RatingScene: React.FC<{ aspect: AdProps["aspect"] }> = ({ aspect }) => {
  const frame = useCurrentFrame();
  const lay = layoutFor(aspect);
  const rating = interpolate(frame, [18, 78], [3.24, 3.31], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill
      style={{
        padding: lay.pad,
        justifyContent: "center",
        alignItems: "center",
        gap: 40 * lay.fontScale,
      }}
    >
      <Caption text="Your DUPR updates itself" size={50 * lay.fontScale} />
      <div
        style={{
          background: "#fff",
          borderRadius: 26,
          padding: `${30 * lay.fontScale}px ${54 * lay.fontScale}px`,
          fontFamily: FONT_STACK,
          boxShadow: "0 18px 50px rgba(0,0,0,0.3)",
          display: "flex",
          alignItems: "baseline",
          gap: 20 * lay.fontScale,
        }}
      >
        <span
          style={{
            fontWeight: 900,
            fontSize: 96 * lay.fontScale,
            color: "#1e3a8a",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {rating.toFixed(3)}
        </span>
        <span
          style={{
            fontWeight: 800,
            fontSize: 30 * lay.fontScale,
            color: BRAND.good,
          }}
        >
          ▲ doubles
        </span>
      </div>
    </AbsoluteFill>
  );
};

/**
 * Soft scene entry — every beat fades in over the persistent brand
 * background, which reads as a pause between scenes instead of a hard cut.
 */
const Scene: React.FC<{
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ children, style }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        ...style,
        opacity: interpolate(frame, [0, 14], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

export const DuprOfficialAd: React.FC<AdProps> = ({
  aspect,
  voiceoverFile,
}) => (
  <AbsoluteFill>
    <BrandBackground />
    <Sequence durationInFrames={95}>
      <Scene>
        <HandshakeScene aspect={aspect} />
      </Scene>
    </Sequence>
    <Sequence from={95} durationInFrames={120}>
      <Scene>
        <ConnectScene aspect={aspect} />
      </Scene>
    </Sequence>
    <Sequence from={215} durationInFrames={120}>
      <Scene>
        <SubmitScene aspect={aspect} />
      </Scene>
    </Sequence>
    <Sequence from={335} durationInFrames={100}>
      <Scene>
        <RatingScene aspect={aspect} />
      </Scene>
    </Sequence>
    <Sequence from={435} durationInFrames={105}>
      <Scene
        style={{
          justifyContent: "center",
          alignItems: "center",
          padding: layoutFor(aspect).pad,
        }}
      >
        <AdCtaOutro
          tagline="Every game counts."
          cta="Link your DUPR"
          scale={layoutFor(aspect).fontScale}
        />
      </Scene>
    </Sequence>
    {/* handshake pills + link */}
    <Sfx at={6} file="whoosh" volume={0.6} />
    <Sfx at={20} file="whoosh" volume={0.6} />
    <Sfx at={36} file="click" volume={0.7} />
    {/* connect card + check + chips */}
    <Sfx at={100} file="whoosh" volume={0.5} />
    <Sfx at={140} file="chime" volume={0.7} />
    {/* submit tap → reported flip + code pop */}
    <Sfx at={265} file="dink" volume={0.8} />
    <Sfx at={291} file="chime" volume={0.7} />
    {/* rating ticks up */}
    <Sfx at={355} file="tick" volume={0.5} />
    <Sfx at={375} file="tick" volume={0.5} />
    <Sfx at={395} file="tick" volume={0.55} />
    <Sfx at={412} file="tick" volume={0.6} />
    {/* outro */}
    <Sfx at={450} file="win" volume={0.8} />
    <AdAudio lines={VO_LINES} voiceoverFile={voiceoverFile} />
  </AbsoluteFill>
);
