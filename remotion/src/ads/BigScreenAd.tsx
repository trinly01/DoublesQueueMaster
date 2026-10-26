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

/**
 * "Big screen" ad — announces the player-view layout rebuilt for a courtside
 * TV/monitor: amber "Up Next" card stacked on top of the Queue, Matches
 * column beside them, and the amber self-pulse that tells a player
 * "that's you". Shows a called match climbing from Queue into Up Next.
 *
 * Scene-synced VO (see scripts/gen-vo.mjs, bs_* lines).
 */
const VO_LINES = [
  { at: 5, file: "bs_intro" },
  { at: 108, file: "bs_layout" },
  { at: 178, file: "bs_called" },
  { at: 238, file: "bs_pulse" },
  { at: 420, file: "bs_outro" },
];

/* Column header gradients — same values as ClubPage.vue */
const GRADIENTS = {
  upNext: "linear-gradient(135deg, #d97706 0%, #f59e0b 100%)",
  queue: "linear-gradient(135deg, #764ba2 0%, #9f7aea 100%)",
  matches: "linear-gradient(135deg, #5a67d8 0%, #667eea 100%)",
};

const AMBER = "#ffb300";

/** Card header — icon-ish glyph + title + count pill, like the app. */
const ColHeader: React.FC<{
  title: string;
  count: number;
  gradient: string;
  flash?: number;
}> = ({ title, count, gradient, flash = 0 }) => (
  <div
    style={{
      background: gradient,
      borderRadius: "18px 18px 0 0",
      padding: "18px 26px",
      display: "flex",
      alignItems: "center",
      gap: 14,
      color: "#fff",
      fontFamily: FONT_STACK,
      fontWeight: 800,
      fontSize: 30,
      position: "relative",
      overflow: "hidden",
    }}
  >
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "#fff",
        opacity: flash * 0.35,
      }}
    />
    <span style={{ fontSize: 30 }}>
      {title === "Up Next" ? "⏳" : title === "Queue" ? "📋" : "🎾"}
    </span>
    {title} ({count})
    <span
      style={{
        marginLeft: "auto",
        background: "#22d3ee",
        borderRadius: 999,
        minWidth: 44,
        textAlign: "center",
        padding: "4px 12px",
        fontSize: 22,
        fontWeight: 800,
      }}
    >
      {count}
    </span>
  </div>
);

/** Queue row — position badge, avatar, name, tiny stats. */
const QueueRow: React.FC<{
  pos: number;
  name: string;
  stats: string;
  isYou?: boolean;
  pulse?: number;
  opacity?: number;
  lift?: number;
}> = ({ pos, name, stats, isYou, pulse = 0, opacity = 1, lift = 0 }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 16,
      background: isYou
        ? `rgba(255,179,0,${(0.08 + pulse * 0.17).toFixed(3)})`
        : "#fff",
      borderLeft: isYou ? `8px solid ${AMBER}` : "8px solid transparent",
      borderRadius: 12,
      padding: "12px 18px",
      fontFamily: FONT_STACK,
      opacity,
      transform: `translateY(${lift}px)`,
      boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
    }}
  >
    <div
      style={{
        width: 46,
        height: 46,
        borderRadius: "50%",
        background: "#2196f3",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 800,
        fontSize: 24,
        flexShrink: 0,
      }}
    >
      {pos}
    </div>
    <div>
      <div style={{ fontWeight: 800, fontSize: 26, color: BRAND.ink }}>
        {name}
      </div>
      <div style={{ fontWeight: 600, fontSize: 18, color: BRAND.grey }}>
        {stats}
      </div>
    </div>
  </div>
);

/** Compact match row used in Up Next / Matches columns. */
const MiniMatch: React.FC<{
  teamA: string;
  teamB: string;
  status: "waiting" | "playing";
  court?: number;
  timer?: string;
  pulse?: number;
  opacity?: number;
  scaleIn?: number;
}> = ({
  teamA,
  teamB,
  status,
  court,
  timer,
  pulse = 0,
  opacity = 1,
  scaleIn = 1,
}) => (
  <div
    style={{
      background:
        status === "playing"
          ? "#fffde7"
          : `rgba(255,179,0,${(0.1 + pulse * 0.22).toFixed(3)})`,
      borderRadius: 12,
      padding: "18px 22px",
      fontFamily: FONT_STACK,
      opacity,
      scale: scaleIn,
      boxShadow: "0 2px 10px rgba(0,0,0,0.10)",
      borderLeft: pulse > 0 ? `8px solid ${AMBER}` : "8px solid transparent",
    }}
  >
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        fontWeight: 800,
        fontSize: 26,
        color: BRAND.ink,
      }}
    >
      <span>{teamA}</span>
      {status === "playing" && court != null && (
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: BRAND.grey,
            fontSize: 22,
            fontWeight: 700,
          }}
        >
          Court
          <span
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: BRAND.ink,
              color: "#fff",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
            }}
          >
            {court}
          </span>
        </span>
      )}
      <span>{teamB}</span>
    </div>
    <div
      style={{
        marginTop: 12,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
      }}
    >
      {status === "waiting" ? (
        <span
          style={{
            background: "#9e9e9e",
            color: "#fff",
            fontWeight: 700,
            fontSize: 20,
            borderRadius: 999,
            padding: "6px 20px",
          }}
        >
          Waiting
        </span>
      ) : (
        <span
          style={{
            color: "#e65100",
            fontWeight: 800,
            fontSize: 24,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          ⏱ {timer}
        </span>
      )}
    </div>
  </div>
);

/**
 * The star of the ad: a TV bezel holding a faithful mini replica of the new
 * layout — Up Next stacked on Queue (left), Matches beside (right).
 * `called` drives the queue→Up Next handoff, `pulse` drives amber self-pulse.
 */
const ScreenMock: React.FC<{
  called: number; // 0→1 handoff progress
  matchPulse: number; // 0..1 for the called match's amber throb
  flash: number; // header flash on the call beat
}> = ({ called, matchPulse, flash }) => {
  const youLift = -interpolate(called, [0, 1], [0, 220]);
  return (
    <div
      style={{
        width: 1440,
        background: "#181820",
        borderRadius: 30,
        padding: 24,
        boxShadow: "0 40px 90px rgba(0,0,0,0.45)",
        fontFamily: FONT_STACK,
      }}
    >
      {/* browser chrome */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "4px 6px 18px",
        }}
      >
        {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
          <div
            key={c}
            style={{
              width: 16,
              height: 16,
              borderRadius: "50%",
              background: c,
            }}
          />
        ))}
        <div
          style={{
            marginLeft: 14,
            background: "#2a2a36",
            color: "#cfd2dc",
            borderRadius: 999,
            padding: "8px 22px",
            fontSize: 20,
            fontWeight: 600,
          }}
        >
          dinkmatch.club
        </div>
      </div>

      {/* app surface */}
      <div
        style={{
          borderRadius: 18,
          overflow: "hidden",
          background: "linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)",
        }}
      >
        {/* club header strip */}
        <div
          style={{
            background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            color: "#fff",
            padding: "20px 30px",
          }}
        >
          <div style={{ fontSize: 34, fontWeight: 900 }}>
            San Fabian Dinkers
          </div>
          <div style={{ fontSize: 20, opacity: 0.85, fontWeight: 600 }}>
            Smart queue matchmaking
          </div>
        </div>

        {/* columns */}
        <div
          style={{
            display: "flex",
            gap: 26,
            padding: 26,
            minHeight: 560,
            alignItems: "stretch",
          }}
        >
          {/* left stack: Up Next on top of Queue */}
          <div
            style={{
              width: 480,
              display: "flex",
              flexDirection: "column",
              gap: 26,
            }}
          >
            {/* Up Next */}
            <div
              style={{
                background: "#fff",
                borderRadius: 18,
                boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
                overflow: "hidden",
                flexShrink: 0,
              }}
            >
              <ColHeader
                title="Up Next"
                count={called > 0.5 ? 2 : 1}
                gradient={GRADIENTS.upNext}
                flash={flash}
              />
              <div
                style={{
                  padding: 16,
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                <MiniMatch
                  teamA="Tito + Ria"
                  teamB="Kim + Lou"
                  status="waiting"
                />
                <MiniMatch
                  teamA="You + Mia"
                  teamB="Rex + Ben"
                  status="waiting"
                  pulse={called > 0.5 ? matchPulse : 0}
                  opacity={called}
                  scaleIn={0.7 + called * 0.3}
                />
              </div>
            </div>

            {/* Queue */}
            <div
              style={{
                background: "#fff",
                borderRadius: 18,
                boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
                overflow: "hidden",
                flex: 1,
              }}
            >
              <ColHeader
                title="Queue"
                count={called > 0.5 ? 1 : 5}
                gradient={GRADIENTS.queue}
              />
              <div
                style={{
                  padding: 14,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <QueueRow
                  pos={1}
                  name="You"
                  stats="G:1  W:1  L:0 · 1500"
                  isYou
                  pulse={matchPulse * 0.6}
                  opacity={1 - called}
                  lift={youLift}
                />
                {[
                  { n: "Mia", s: "G:0  W:0  L:0 · 1500" },
                  { n: "Rex", s: "G:2  W:1  L:1 · 1480" },
                  { n: "Ben", s: "G:1  W:0  L:1 · 1490" },
                ].map((p, i) => (
                  <QueueRow
                    key={p.n}
                    pos={i + 2}
                    name={p.n}
                    stats={p.s}
                    opacity={1 - called}
                    lift={youLift}
                  />
                ))}
                <QueueRow
                  pos={called > 0.5 ? 1 : 5}
                  name="Ana"
                  stats="G:3  W:2  L:1 · 1520"
                />
              </div>
            </div>
          </div>

          {/* right: Matches */}
          <div
            style={{
              flex: 1,
              background: "#fff",
              borderRadius: 18,
              boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <ColHeader title="Matches" count={1} gradient={GRADIENTS.matches} />
            <div style={{ padding: 18 }}>
              <MiniMatch
                teamA="Sam + Pat"
                teamB="Jo + Dee"
                status="playing"
                court={1}
                timer="12:34"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/** Intro: 0-60 — title over brand bg. */
const IntroScene: React.FC<{ aspect: AdProps["aspect"] }> = ({ aspect }) => {
  const lay = layoutFor(aspect);
  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        gap: 34 * lay.fontScale,
        padding: lay.pad,
      }}
    >
      <Caption
        text={"Open play,\non the big screen"}
        size={72 * lay.fontScale}
      />
      <Caption
        text="The player view — rebuilt for your courtside TV"
        size={34 * lay.fontScale}
        tone="gold"
        from={16}
      />
    </AbsoluteFill>
  );
};

/** Mock scene (absolute frames 60-400; local 0-340). */
const MockScene: React.FC<{ aspect: AdProps["aspect"] }> = ({ aspect }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lay = layoutFor(aspect);
  const mockScale = lay.isVertical ? 0.6 : lay.isSquare ? 0.8 : 1;

  const CALL = 115; // local frame the match gets called
  const enter = spring({
    frame,
    fps,
    config: { damping: 15, stiffness: 90 },
  });
  const called = interpolate(frame, [CALL, CALL + 40], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const flash = interpolate(
    frame,
    [CALL + 18, CALL + 24, CALL + 48],
    [0, 1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );
  // amber throb — active from the call onward (gentle pre-call on your row)
  const pulseStart = CALL + 40;
  const matchPulse =
    frame < pulseStart
      ? 0.35 + 0.35 * Math.sin(frame / 7)
      : 0.5 + 0.5 * Math.sin((frame - pulseStart) / 7);

  const cap = (
    f0: number,
    f1: number,
    text: string,
    tone: "light" | "gold" = "light",
  ) =>
    frame >= f0 && frame < f1 ? (
      <Caption text={text} size={40 * lay.fontScale} tone={tone} from={f0} />
    ) : null;

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
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 40,
          scale: `${(0.92 + enter * 0.08) * mockScale}`,
          opacity: enter,
          translate: `0px ${(1 - enter) * 90}px`,
        }}
      >
        <ScreenMock called={called} matchPulse={matchPulse} flash={flash} />
        <div style={{ minHeight: 110, display: "flex", alignItems: "center" }}>
          {cap(
            40,
            112,
            "Up Next now sits on top of the Queue — called matches, front and center",
          )}
          {cap(
            120,
            178,
            "Your match is called — it climbs straight to Up Next",
            "gold",
          )}
          {cap(185, 250, "The amber pulse? That's you. Get ready.", "gold")}
          {cap(
            255,
            335,
            "Queue → Up Next → Playing — one board every player can see",
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const BigScreenAd: React.FC<AdProps> = ({ aspect, voiceoverFile }) => (
  <AbsoluteFill>
    <BrandBackground />
    <Sequence durationInFrames={60}>
      <IntroScene aspect={aspect} />
    </Sequence>
    <Sequence from={60} durationInFrames={340}>
      <MockScene aspect={aspect} />
    </Sequence>
    <Sequence from={400} durationInFrames={140}>
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <AdCtaOutro
          tagline="One board. Every screen. Zero who's-next arguments."
          cta="dinkmatch.club"
          scale={layoutFor(aspect).fontScale}
        />
      </AbsoluteFill>
    </Sequence>
    <Sfx at={60} file="whoosh" volume={0.5} />
    <Sfx at={100} file="chime" volume={0.5} />
    <Sfx at={175} file="chime" volume={0.8} />
    <Sfx at={195} file="tick" volume={0.55} />
    <Sfx at={240} file="dink" volume={0.6} />
    <Sfx at={402} file="win" volume={0.8} />
    <AdAudio lines={VO_LINES} voiceoverFile={voiceoverFile} />
  </AbsoluteFill>
);
