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
import { AdCtaOutro } from "../components/AdCtaOutro";
import { AdAudio, Sfx } from "../components/AdAudio";

const BUBBLES = [
  "Wait — I'm resting!",
  "I came with my partner!",
  "Don't put me with him…",
];

/** Voiceover lines scheduled at each scene/beat start (see gen-vo.mjs). */
const VO_LINES = [
  { at: 5, file: "zp_hook" },
  { at: 100, file: "zp_lock" },
  { at: 195, file: "zp_duo" },
  { at: 290, file: "zp_avoid" },
  { at: 385, file: "zp_cta" },
];

/** Beat 1 (0–3s): organizer bombarded by requests. */
const ChaosScene: React.FC<{ aspect: AdProps["aspect"] }> = ({ aspect }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lay = layoutFor(aspect);
  const wobble = Math.sin(frame / 6) * 6;
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
        text="Running open play shouldn't feel like refereeing."
        size={52 * lay.fontScale}
      />
      {/* bubbles fan around the chip — never overlap the caption */}
      <div
        style={{
          position: "relative",
          height: 340 * lay.fontScale,
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ transform: `rotate(${wobble}deg)` }}>
          <PlayerChip
            name="ORGANIZER"
            skill="intermediate"
            size={84 * lay.fontScale}
          />
        </div>
        {BUBBLES.map((b, i) => {
          const p = spring({
            frame: frame - 8 - i * 10,
            fps,
            config: { damping: 12, stiffness: 180 },
          });
          // fan out beside/below the chip — caption + chip stay clear
          const pos = [
            { x: -400, y: -120 },
            { x: 150, y: -60 },
            { x: -170, y: 150 },
          ][i];
          return (
            <div
              key={b}
              style={{
                position: "absolute",
                left: `calc(50% + ${pos.x * lay.fontScale}px)`,
                top: `calc(50% + ${pos.y * lay.fontScale}px)`,
                background: "#fff",
                borderRadius: 18,
                padding: "12px 20px",
                fontFamily: FONT_STACK,
                fontWeight: 700,
                fontSize: 26 * lay.fontScale,
                color: BRAND.ink,
                boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
                transform: `scale(${p})`,
                opacity: p,
                whiteSpace: "nowrap",
              }}
            >
              {b}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/** A queue row card + kebab menu opening on the chosen action. */
const ActionRow: React.FC<{
  aspect: AdProps["aspect"];
  name: string;
  skill?: "beginner" | "intermediate" | "advanced";
  menuItem: string;
  badge?: "lock" | "link" | "avoid";
  badgeDelay?: number;
}> = ({
  aspect,
  name,
  skill = "intermediate",
  menuItem,
  badge,
  badgeDelay = 30,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lay = layoutFor(aspect);
  const menu = spring({
    frame: frame - 12,
    fps,
    config: { damping: 14, stiffness: 200 },
  });
  const badgePop = spring({
    frame: frame - badgeDelay,
    fps,
    config: { damping: 10, stiffness: 220 },
  });
  return (
    <div style={{ position: "relative" }}>
      <div
        style={{
          background: "#fff",
          borderRadius: 18,
          padding: `${14 * lay.fontScale}px ${22 * lay.fontScale}px`,
          display: "flex",
          alignItems: "center",
          gap: 16 * lay.fontScale,
          width: lay.isVertical ? 780 : 560,
          boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
        }}
      >
        <PlayerChip
          name={name}
          skill={skill}
          size={56 * lay.fontScale}
          lock={badge === "lock" && badgePop > 0.5}
          link={badge === "link" && badgePop > 0.5}
          avoid={badge === "avoid" && badgePop > 0.5}
        />
        <div
          style={{
            marginLeft: "auto",
            fontFamily: FONT_STACK,
            fontWeight: 900,
            fontSize: 30 * lay.fontScale,
            color: BRAND.grey,
            letterSpacing: 3,
          }}
        >
          ⋮
        </div>
      </div>
      {/* kebab menu */}
      <div
        style={{
          position: "absolute",
          right: 10,
          top: "100%",
          marginTop: 8,
          background: "#fff",
          borderRadius: 14,
          padding: "8px 0",
          minWidth: 230 * lay.fontScale,
          boxShadow: "0 14px 40px rgba(0,0,0,0.3)",
          transformOrigin: "top right",
          transform: `scale(${menu})`,
          opacity: menu,
          zIndex: 5,
        }}
      >
        {["Lock player", "Pair duo…", "Avoid player…", "Check out"].map(
          (item) => (
            <div
              key={item}
              style={{
                fontFamily: FONT_STACK,
                fontSize: 23 * lay.fontScale,
                fontWeight: item === menuItem ? 800 : 500,
                color: item === menuItem ? BRAND.purpleTo : BRAND.ink,
                background:
                  item === menuItem ? "rgba(102,126,234,0.12)" : "transparent",
                padding: `${10 * lay.fontScale}px ${18 * lay.fontScale}px`,
              }}
            >
              {item}
            </div>
          ),
        )}
      </div>
    </div>
  );
};

/** Beats 2–4: three feature beats inside one sliding stage. */
const FeaturesScene: React.FC<{ aspect: AdProps["aspect"] }> = ({ aspect }) => {
  const frame = useCurrentFrame();
  const lay = layoutFor(aspect);
  // Each beat 95 frames: lock 0–95, duo 95–190, avoid 190–285
  const beat = Math.floor(frame / 95);
  const beats = [
    {
      name: "Sam",
      menuItem: "Lock player",
      badge: "lock" as const,
      text: "Water break? Lock their spot. 🔒",
    },
    {
      name: "Pat & Jo",
      menuItem: "Pair duo…",
      badge: "link" as const,
      text: "Came as a pair? Link a Fixed Duo. 🔗",
    },
    {
      name: "Dev",
      menuItem: "Avoid player…",
      badge: "avoid" as const,
      text: "Clash on court? Quietly separate — zero drama. 🚫",
    },
  ];
  const slide = interpolate(frame % 95, [0, 12], [40, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const current = beats[Math.min(beat, 2)];
  return (
    <AbsoluteFill
      style={{
        padding: lay.pad,
        justifyContent: "center",
        alignItems: "center",
        gap: 56 * lay.fontScale,
      }}
    >
      <Caption
        key={beat}
        text={current.text}
        size={44 * lay.fontScale}
        tone="gold"
      />
      <div style={{ transform: `translateY(${slide}px)` }}>
        <ActionRow
          aspect={aspect}
          name={current.name}
          menuItem={current.menuItem}
          badge={current.badge}
          badgeDelay={38}
        />
      </div>
      {/* spacer keeps the open menu clear of the staff-only note */}
      <div style={{ height: 180 * lay.fontScale }} />
      {beat === 2 && frame % 95 > 40 && (
        <div
          style={{
            fontFamily: FONT_STACK,
            fontWeight: 700,
            fontSize: 26 * lay.fontScale,
            color: "rgba(255,255,255,0.85)",
            background: "rgba(0,0,0,0.25)",
            borderRadius: 999,
            padding: "8px 22px",
          }}
        >
          Admin &amp; moderator eyes only
        </div>
      )}
    </AbsoluteFill>
  );
};

export const ZeroPoliticsAd: React.FC<AdProps> = ({
  aspect,
  voiceoverFile,
}) => (
  <AbsoluteFill>
    <BrandBackground />
    <Sequence durationInFrames={95}>
      <ChaosScene aspect={aspect} />
    </Sequence>
    <Sequence from={95} durationInFrames={285}>
      <FeaturesScene aspect={aspect} />
    </Sequence>
    <Sequence from={380} durationInFrames={160}>
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          gap: 30 * layoutFor(aspect).fontScale,
        }}
      >
        <Caption
          text="Courts auto-fill as games end."
          size={30 * layoutFor(aspect).fontScale}
          tone="gold"
        />
        <AdCtaOutro
          tagline="Let the algorithm take the blame."
          cta="Run your club free"
          scale={layoutFor(aspect).fontScale}
        />
      </AbsoluteFill>
    </Sequence>
    {/* chaos: each speech bubble pops */}
    <Sfx at={20} file="click" volume={0.4} />
    <Sfx at={30} file="click" volume={0.4} />
    <Sfx at={40} file="click" volume={0.4} />
    {/* beat 1 (95–190): menu opens + lock snaps */}
    <Sfx at={107} file="click" volume={0.5} />
    <Sfx at={133} file="click" volume={0.8} />
    {/* beat 2 (190–285): menu + duo link chime */}
    <Sfx at={202} file="click" volume={0.5} />
    <Sfx at={228} file="chime" volume={0.7} />
    {/* beat 3 (285–380): menu + avoid soft thud */}
    <Sfx at={297} file="click" volume={0.5} />
    <Sfx at={323} file="dink" volume={0.7} />
    {/* outro */}
    <Sfx at={385} file="win" volume={0.8} />
    <AdAudio lines={VO_LINES} voiceoverFile={voiceoverFile} />
  </AbsoluteFill>
);
