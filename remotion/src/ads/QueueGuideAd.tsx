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

/**
 * Scene-synced VO (see scripts/gen-vo.mjs). Cues are lag-shifted a few frames
 * past each scene start so lines never overlap (~3.4s lines vs 3.5s scenes).
 */
const VO_LINES = [
  { at: 5, file: "qg_intro" },
  { at: 78, file: "qg_s1" },
  { at: 182, file: "qg_s2" },
  { at: 279, file: "qg_s3" },
  { at: 375, file: "qg_s4" },
  { at: 480, file: "qg_s5" },
  { at: 607, file: "qg_outro" },
];

/** Gold numbered step badge — mirrors the poster's orange circles. */
const StepBadge: React.FC<{ n: number }> = ({ n }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 10, stiffness: 200 } });
  return (
    <div
      style={{
        width: 78,
        height: 78,
        borderRadius: "50%",
        background: BRAND.gold,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: FONT_STACK,
        fontWeight: 900,
        fontSize: 40,
        color: BRAND.ink,
        transform: `scale(${pop})`,
        boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
        flexShrink: 0,
      }}
    >
      {n}
    </div>
  );
};

/** Shared step layout: badge + title + caption + visual slot. */
const StepFrame: React.FC<{
  aspect: AdProps["aspect"];
  n: number;
  title: string;
  caption: string;
  children?: React.ReactNode;
}> = ({ aspect, n, title, caption, children }) => {
  const lay = layoutFor(aspect);
  return (
    <AbsoluteFill
      style={{
        padding: lay.pad,
        justifyContent: "center",
        alignItems: "center",
        gap: 36 * lay.fontScale,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 26 * lay.fontScale,
        }}
      >
        <StepBadge n={n} />
        <Caption
          text={title}
          size={50 * lay.fontScale}
          tone="gold"
          align="left"
        />
      </div>
      {children}
      <Caption text={caption} size={34 * lay.fontScale} />
    </AbsoluteFill>
  );
};

/** Intro (0–2s). */
const IntroScene: React.FC<{ aspect: AdProps["aspect"] }> = ({ aspect }) => {
  const lay = layoutFor(aspect);
  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        gap: 40 * lay.fontScale,
        padding: lay.pad,
      }}
    >
      <Caption
        text={"Open Play\nOnline Queueing Guide"}
        size={62 * lay.fontScale}
      />
      <Caption
        text="How it works — in 5 steps"
        size={34 * lay.fontScale}
        tone="gold"
        from={15}
      />
    </AbsoluteFill>
  );
};

/** Step 1 visual: chip slides in, a "checked in" row card appears. */
const CheckInScene: React.FC<{ aspect: AdProps["aspect"] }> = ({ aspect }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lay = layoutFor(aspect);
  const slide = interpolate(frame, [10, 40], [-320, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const check = spring({
    frame: frame - 45,
    fps,
    config: { damping: 10, stiffness: 220 },
  });
  return (
    <StepFrame
      aspect={aspect}
      n={1}
      title="Check In"
      caption="See your club admin to register for open play."
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 20,
          padding: `${16 * lay.fontScale}px ${26 * lay.fontScale}px`,
          display: "flex",
          alignItems: "center",
          gap: 18 * lay.fontScale,
          transform: `translateX(${slide}px)`,
          minWidth: 420 * lay.fontScale,
          boxShadow: "0 12px 34px rgba(0,0,0,0.22)",
        }}
      >
        <PlayerChip name="You" skill="intermediate" size={56 * lay.fontScale} />
        <div
          style={{
            marginLeft: "auto",
            fontFamily: FONT_STACK,
            fontWeight: 800,
            fontSize: 24 * lay.fontScale,
            color: BRAND.good,
            transform: `scale(${check})`,
            opacity: check,
          }}
        >
          ✓ Checked in
        </div>
      </div>
    </StepFrame>
  );
};

/** Step 2 visual: live queue column building with position numbers. */
const QueueScene: React.FC<{ aspect: AdProps["aspect"] }> = ({ aspect }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lay = layoutFor(aspect);
  const names = ["Ana", "Rex", "You", "Mia"];
  return (
    <StepFrame
      aspect={aspect}
      n={2}
      title="View the Queue"
      caption="You're added automatically — watch your position."
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12 * lay.fontScale,
        }}
      >
        {names.map((n, i) => {
          const p = spring({
            frame: frame - 8 - i * 7,
            fps,
            config: { damping: 13, stiffness: 180 },
          });
          return (
            <div
              key={n}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16 * lay.fontScale,
                background: n === "You" ? "#fff" : "rgba(255,255,255,0.14)",
                border:
                  n === "You"
                    ? `3px solid ${BRAND.gold}`
                    : "3px solid transparent",
                borderRadius: 999,
                padding: `${8 * lay.fontScale}px ${18 * lay.fontScale}px`,
                transform: `translateX(${(1 - p) * 80}px)`,
                opacity: p,
                minWidth: 380 * lay.fontScale,
              }}
            >
              <span
                style={{
                  fontFamily: FONT_STACK,
                  fontWeight: 900,
                  fontSize: 24 * lay.fontScale,
                  color: n === "You" ? BRAND.purpleTo : "#fff",
                  width: 44 * lay.fontScale,
                }}
              >
                #{i + 1}
              </span>
              <PlayerChip
                name={n}
                skill={
                  n === "Rex"
                    ? "advanced"
                    : n === "Mia"
                      ? "intermediate"
                      : "beginner"
                }
                size={44 * lay.fontScale}
              />
              <span
                style={{
                  marginLeft: "auto",
                  fontFamily: FONT_STACK,
                  fontWeight: 700,
                  fontSize: 18 * lay.fontScale,
                  color: n === "You" ? BRAND.grey : "rgba(255,255,255,0.75)",
                }}
              >
                ⏱ {[14, 9, 4, 2][i]}m
              </span>
            </div>
          );
        })}
      </div>
    </StepFrame>
  );
};

/**
 * Step 3 visual — mirrors the real UI: your queue row's position badge ticks
 * 3 → 2 → 1, then your name pops into the Matches column on a "Court 2" card
 * (voice announcement included — TTS is a real feature).
 */
const YourTurnScene: React.FC<{ aspect: AdProps["aspect"] }> = ({ aspect }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lay = layoutFor(aspect);
  const pos = frame < 25 ? 3 : frame < 50 ? 2 : frame < 75 ? 1 : 0;
  const pop = spring({
    frame: frame - 75,
    fps,
    config: { damping: 11, stiffness: 190 },
  });
  return (
    <StepFrame
      aspect={aspect}
      n={3}
      title="Wait for Your Turn"
      caption="Watch the queue — the app calls your court."
    >
      {pos === 0 ? (
        <div style={{ transform: `scale(${pop})` }}>
          <CourtMatchCard
            label="Court 2 🔊"
            teamA={[
              { name: "You", skill: "intermediate" },
              { name: "Ana", skill: "beginner" },
            ]}
            teamB={[
              { name: "Rex", skill: "advanced" },
              { name: "Mia", skill: "intermediate" },
            ]}
            mode="Standard"
            scale={lay.fontScale}
          />
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16 * lay.fontScale,
            background: "#fff",
            border: `3px solid ${BRAND.gold}`,
            borderRadius: 999,
            padding: `${10 * lay.fontScale}px ${22 * lay.fontScale}px`,
            minWidth: 380 * lay.fontScale,
            boxShadow: "0 12px 34px rgba(0,0,0,0.22)",
          }}
        >
          <span
            style={{
              fontFamily: FONT_STACK,
              fontWeight: 900,
              fontSize: 30 * lay.fontScale,
              color: BRAND.purpleTo,
              fontVariantNumeric: "tabular-nums",
              width: 54 * lay.fontScale,
            }}
          >
            #{pos}
          </span>
          <PlayerChip
            name="You"
            skill="intermediate"
            size={52 * lay.fontScale}
          />
          <span
            style={{
              marginLeft: "auto",
              fontFamily: FONT_STACK,
              fontWeight: 700,
              fontSize: 20 * lay.fontScale,
              color: BRAND.grey,
            }}
          >
            in queue
          </span>
        </div>
      )}
    </StepFrame>
  );
};

/** Step 4 visual: score card + reported check. */
const ReportScene: React.FC<{ aspect: AdProps["aspect"] }> = ({ aspect }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lay = layoutFor(aspect);
  const slam = spring({ frame, fps, config: { damping: 11, stiffness: 180 } });
  const tick = spring({
    frame: frame - 35,
    fps,
    config: { damping: 10, stiffness: 220 },
  });
  return (
    <StepFrame
      aspect={aspect}
      n={4}
      title="Report the Score"
      caption="Tell your Queue Master — they log the result."
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 24,
          padding: `${24 * lay.fontScale}px ${56 * lay.fontScale}px`,
          display: "flex",
          alignItems: "center",
          gap: 28 * lay.fontScale,
          transform: `scale(${slam})`,
          boxShadow: "0 14px 40px rgba(0,0,0,0.28)",
          fontFamily: FONT_STACK,
        }}
      >
        <span
          style={{
            fontWeight: 900,
            fontSize: 84 * lay.fontScale,
            color: BRAND.ink,
          }}
        >
          11
        </span>
        <span
          style={{
            fontWeight: 800,
            fontSize: 40 * lay.fontScale,
            color: BRAND.grey,
          }}
        >
          –
        </span>
        <span
          style={{
            fontWeight: 900,
            fontSize: 84 * lay.fontScale,
            color: BRAND.ink,
          }}
        >
          9
        </span>
        <span
          style={{
            fontWeight: 800,
            fontSize: 26 * lay.fontScale,
            color: BRAND.good,
            transform: `scale(${tick})`,
            opacity: tick,
          }}
        >
          ✓ Reported
        </span>
      </div>
    </StepFrame>
  );
};

/** Step 5 visual: your chip exits the queue, everyone slides up. */
const CheckOutScene: React.FC<{ aspect: AdProps["aspect"] }> = ({ aspect }) => {
  const frame = useCurrentFrame();
  const lay = layoutFor(aspect);
  const exit = interpolate(frame, [15, 55], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const lift = interpolate(frame, [45, 70], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const rowW = 380 * lay.fontScale;
  const rowH = 74 * lay.fontScale;
  const names = ["You", "Mia", "Ben"];
  return (
    <StepFrame
      aspect={aspect}
      n={5}
      title="Check Out"
      caption="Leaving? The Queue Master checks you out."
    >
      <div
        style={{
          position: "relative",
          height: names.length * (rowH + 10),
          width: rowW,
        }}
      >
        {names.map((n, i) => {
          const isYou = n === "You";
          // your chip slides out right + fades; others slide up one slot
          const x = isYou ? exit * 260 : 0;
          const y = !isYou && i > 0 ? -lift * (rowH + 10) : 0;
          return (
            <div
              key={n}
              style={{
                position: "absolute",
                top: i * (rowH + 10),
                left: 0,
                right: 0,
                height: rowH,
                display: "flex",
                alignItems: "center",
                gap: 14 * lay.fontScale,
                background: isYou ? "#fff" : "rgba(255,255,255,0.14)",
                border: isYou
                  ? `3px solid ${BRAND.gold}`
                  : "3px solid transparent",
                borderRadius: 999,
                padding: `0 ${18 * lay.fontScale}px`,
                transform: `translate(${x}px, ${y}px)`,
                opacity: isYou ? 1 - exit : 1,
              }}
            >
              <span
                style={{
                  position: "relative",
                  fontFamily: FONT_STACK,
                  fontWeight: 900,
                  fontSize: 22 * lay.fontScale,
                  color: isYou ? BRAND.purpleTo : "#fff",
                  width: 34 * lay.fontScale,
                }}
              >
                <span style={{ opacity: isYou ? 1 : 1 - lift }}>#{i + 1}</span>
                {!isYou && i > 0 && (
                  <span
                    style={{
                      position: "absolute",
                      left: 0,
                      opacity: lift,
                    }}
                  >
                    #{i}
                  </span>
                )}
              </span>
              <PlayerChip
                name={n}
                skill={n === "Ben" ? "beginner" : "intermediate"}
                size={44 * lay.fontScale}
              />
              {isYou && (
                <span
                  style={{
                    marginLeft: "auto",
                    fontFamily: FONT_STACK,
                    fontWeight: 800,
                    fontSize: 20 * lay.fontScale,
                    color: BRAND.bad,
                  }}
                >
                  ⊖ Check out
                </span>
              )}
            </div>
          );
        })}
      </div>
    </StepFrame>
  );
};

export const QueueGuideAd: React.FC<AdProps> = ({ aspect, voiceoverFile }) => (
  <AbsoluteFill>
    <BrandBackground />
    <Sequence durationInFrames={60}>
      <IntroScene aspect={aspect} />
    </Sequence>
    <Sequence from={60} durationInFrames={105}>
      <CheckInScene aspect={aspect} />
    </Sequence>
    <Sequence from={165} durationInFrames={105}>
      <QueueScene aspect={aspect} />
    </Sequence>
    <Sequence from={270} durationInFrames={105}>
      <YourTurnScene aspect={aspect} />
    </Sequence>
    <Sequence from={375} durationInFrames={105}>
      <ReportScene aspect={aspect} />
    </Sequence>
    <Sequence from={480} durationInFrames={105}>
      <CheckOutScene aspect={aspect} />
    </Sequence>
    <Sequence from={585} durationInFrames={150}>
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <AdCtaOutro
          tagline="Organized queue. Fair play. More games."
          cta="dinkmatch.club"
          scale={layoutFor(aspect).fontScale}
        />
      </AbsoluteFill>
    </Sequence>
    {/* SFX per beat */}
    <Sfx at={60} file="click" volume={0.5} />
    <Sfx at={105} file="chime" volume={0.6} />
    <Sfx at={175} file="tick" volume={0.6} />
    <Sfx at={295} file="tick" volume={0.55} />
    <Sfx at={320} file="tick" volume={0.55} />
    <Sfx at={345} file="chime" volume={0.8} />
    <Sfx at={380} file="dink" volume={0.7} />
    <Sfx at={410} file="chime" volume={0.6} />
    <Sfx at={495} file="whoosh" volume={0.45} />
    <Sfx at={590} file="win" volume={0.8} />
    <AdAudio lines={VO_LINES} voiceoverFile={voiceoverFile} />
  </AbsoluteFill>
);
