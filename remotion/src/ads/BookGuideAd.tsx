import {
  AbsoluteFill,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { AdProps, BRAND, FONT_STACK, GRADIENT, layoutFor } from "../theme";
import { BrandBackground } from "../components/BrandBackground";
import { Caption } from "../components/Caption";
import { AdCtaOutro } from "../components/AdCtaOutro";
import { AdAudio } from "../components/AdAudio";

export interface BookGuideProps extends AdProps {
  /** "full" ≈31s tutorial, "short" ≈20s cutdown — same scenes, tighter timing. */
  cut?: "full" | "short";
}

/**
 * Scene-synced VO (see scripts/vo-lines.mjs bk_* lines). Cues are lag-shifted
 * a few frames past each scene start so lines never overlap.
 */
const VO_FULL = [
  { at: 5, file: "bk_intro" },
  { at: 85, file: "bk_s1" },
  { at: 203, file: "bk_s2" },
  { at: 353, file: "bk_s3" },
  { at: 503, file: "bk_s4" },
  { at: 683, file: "bk_s5" },
  { at: 818, file: "bk_outro" },
];
// No intro line — the 1.5s title card plays silent; any VO there overlaps s1.
const VO_SHORT = [
  { at: 53, file: "bkq_s1" },
  { at: 128, file: "bkq_s2" },
  { at: 203, file: "bkq_s3" },
  { at: 278, file: "bkq_s45" },
  { at: 458, file: "bk_outro" },
];

/** Scene start frames per cut — [intro, s1..s5, outro]. */
const CUTS = {
  full: { at: [0, 60, 195, 345, 495, 675, 810], outroLen: 135, total: 945 },
  short: { at: [0, 45, 120, 195, 270, 375, 450], outroLen: 135, total: 585 },
} as const;

/** Gold numbered step badge — same as QueueGuideAd. */
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
        gap: 30 * lay.fontScale,
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
          size={48 * lay.fontScale}
          tone="gold"
          align="left"
        />
      </div>
      {children}
      <Caption text={caption} size={32 * lay.fontScale} />
    </AbsoluteFill>
  );
};

/** Intro — title card. */
const IntroScene: React.FC<{ aspect: AdProps["aspect"] }> = ({ aspect }) => {
  const lay = layoutFor(aspect);
  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        gap: 36 * lay.fontScale,
        padding: lay.pad,
      }}
    >
      <Caption text={"Book a Court\nOnline"} size={64 * lay.fontScale} />
      <Caption
        text="How it works — in 5 steps"
        size={34 * lay.fontScale}
        tone="gold"
        from={15}
      />
    </AbsoluteFill>
  );
};

/** Step 1 visual: /book venue cards slide in, one highlights + Book pill. */
const VenueScene: React.FC<{ aspect: AdProps["aspect"] }> = ({ aspect }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lay = layoutFor(aspect);
  const venues = ["Siklab Pickleball Club", "City Courts PH"];
  return (
    <StepFrame
      aspect={aspect}
      n={1}
      title="Pick a Venue"
      caption="Browse real venues — photos, courts, live availability."
    >
      <div
        style={{
          display: "flex",
          flexDirection: lay.isWide ? "row" : "column",
          gap: 22 * lay.fontScale,
        }}
      >
        {venues.map((name, i) => {
          const hot = i === 0;
          const slide = interpolate(frame, [8 + i * 14, 34 + i * 14], [-140, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const ring = hot
            ? spring({ frame: frame - 40, fps, config: { damping: 9, stiffness: 200 } })
            : 0;
          return (
            <div
              key={name}
              style={{
                width: 340 * lay.fontScale,
                background: "#fff",
                borderRadius: 22,
                padding: `${18 * lay.fontScale}px`,
                transform: `translateY(${slide}px) scale(${hot ? 1 + ring * 0.04 : 1})`,
                opacity: slide === -140 ? 0 : 1,
                boxShadow: hot
                  ? `0 0 0 ${6 * ring}px rgba(118,75,162,0.35), 0 16px 40px rgba(0,0,0,0.28)`
                  : "0 12px 32px rgba(0,0,0,0.2)",
                border: hot ? `3px solid ${BRAND.purpleTo}` : "3px solid transparent",
              }}
            >
              <div
                style={{
                  height: 74 * lay.fontScale,
                  borderRadius: 14,
                  background: GRADIENT,
                  marginBottom: 14 * lay.fontScale,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 34 * lay.fontScale,
                }}
              >
                🏸
              </div>
              <div
                style={{
                  fontFamily: FONT_STACK,
                  fontWeight: 800,
                  fontSize: 22 * lay.fontScale,
                  color: BRAND.ink,
                }}
              >
                {name}
              </div>
              <div
                style={{
                  fontFamily: FONT_STACK,
                  fontSize: 16 * lay.fontScale,
                  color: BRAND.grey,
                  marginTop: 4 * lay.fontScale,
                }}
              >
                3 courts · from ₱300/hr
              </div>
              <div
                style={{
                  marginTop: 14 * lay.fontScale,
                  background: GRADIENT,
                  color: "#fff",
                  fontFamily: FONT_STACK,
                  fontWeight: 800,
                  fontSize: 18 * lay.fontScale,
                  borderRadius: 999,
                  padding: `${8 * lay.fontScale}px 0`,
                  textAlign: "center",
                }}
              >
                Book
              </div>
            </div>
          );
        })}
      </div>
    </StepFrame>
  );
};

/** Step 2 visual: court chip + date strip + time grid; one slot fills accent. */
const SlotScene: React.FC<{ aspect: AdProps["aspect"] }> = ({ aspect }) => {
  const frame = useCurrentFrame();
  const lay = layoutFor(aspect);
  const dates = ["11 Nov", "12 Nov", "13 Nov", "14 Nov"];
  const times = ["11:00", "12:00", "13:00", "14:00", "15:00", "16:00"];
  return (
    <StepFrame
      aspect={aspect}
      n={2}
      title="Pick Your Slot"
      caption="Court, date, time — only open slots are shown."
    >
      <div
        style={{
          width: 460 * lay.fontScale,
          background: "#fff",
          borderRadius: 22,
          padding: `${20 * lay.fontScale}px`,
          boxShadow: "0 16px 44px rgba(0,0,0,0.3)",
        }}
      >
        {/* court chip */}
        <div
          style={{
            display: "inline-block",
            background: "rgba(118,75,162,0.12)",
            color: BRAND.purpleTo,
            fontFamily: FONT_STACK,
            fontWeight: 700,
            fontSize: 18 * lay.fontScale,
            borderRadius: 999,
            padding: `${6 * lay.fontScale}px ${16 * lay.fontScale}px`,
            marginBottom: 14 * lay.fontScale,
          }}
        >
          Arena Court 1
        </div>
        {/* date strip */}
        <div style={{ display: "flex", gap: 8 * lay.fontScale, marginBottom: 14 * lay.fontScale }}>
          {dates.map((d, i) => (
            <div
              key={d}
              style={{
                fontFamily: FONT_STACK,
                fontWeight: i === 0 ? 800 : 600,
                fontSize: 15 * lay.fontScale,
                color: i === 0 ? "#fff" : BRAND.grey,
                background: i === 0 ? GRADIENT : "#f1f1f4",
                borderRadius: 999,
                padding: `${7 * lay.fontScale}px ${12 * lay.fontScale}px`,
              }}
            >
              {d}
            </div>
          ))}
        </div>
        {/* time grid — 13:00 cell fills accent */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 8 * lay.fontScale,
          }}
        >
          {times.map((t, i) => {
            const picked = i === 2;
            const fill = picked
              ? interpolate(frame, [30, 55], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                })
              : 0;
            return (
              <div
                key={t}
                style={{
                  fontFamily: FONT_STACK,
                  fontWeight: 700,
                  fontSize: 16 * lay.fontScale,
                  textAlign: "center",
                  borderRadius: 12,
                  padding: `${9 * lay.fontScale}px 0`,
                  background: picked
                    ? `rgba(118,75,162,${0.15 + fill * 0.85})`
                    : "#f6f6f8",
                  color: picked && fill > 0.6 ? "#fff" : BRAND.ink,
                  border: `2px solid ${picked ? BRAND.purpleTo : "transparent"}`,
                  transform: picked ? `scale(${1 + fill * 0.06})` : "none",
                }}
              >
                {t}
              </div>
            );
          })}
        </div>
        <div
          style={{
            marginTop: 14 * lay.fontScale,
            fontFamily: FONT_STACK,
            fontWeight: 800,
            fontSize: 18 * lay.fontScale,
            color: BRAND.purpleTo,
            opacity: interpolate(frame, [55, 75], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          ✓ 13:00–14:00 · ₱400
        </div>
      </div>
    </StepFrame>
  );
};

/** Step 3 visual: name/phone inputs fill, reserve button, hold countdown. */
const DetailsScene: React.FC<{ aspect: AdProps["aspect"] }> = ({ aspect }) => {
  const frame = useCurrentFrame();
  const lay = layoutFor(aspect);
  const nameFill = interpolate(frame, [20, 55], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const phoneFill = interpolate(frame, [55, 90], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const press = spring({ frame: frame - 95, fps: 30, config: { damping: 12, stiffness: 200 } });
  const holdIn = spring({ frame: frame - 115, fps: 30, config: { damping: 11, stiffness: 170 } });
  const NAME = "Juan Dela Cruz";
  const PHONE = "0917 123 4567";
  return (
    <StepFrame
      aspect={aspect}
      n={3}
      title="Your Details"
      caption="Name + mobile — slots are held while you pay."
    >
      <div
        style={{
          width: 420 * lay.fontScale,
          background: "#fff",
          borderRadius: 22,
          padding: `${20 * lay.fontScale}px`,
          boxShadow: "0 16px 44px rgba(0,0,0,0.3)",
          display: "flex",
          flexDirection: "column",
          gap: 12 * lay.fontScale,
        }}
      >
        {["Full name *", "Mobile number *"].map((label, i) => {
          const fill = i === 0 ? nameFill : phoneFill;
          const text = i === 0 ? NAME : PHONE;
          return (
            <div
              key={label}
              style={{
                border: `2px solid ${BRAND.purpleTo}`,
                borderRadius: 14,
                padding: `${10 * lay.fontScale}px ${14 * lay.fontScale}px`,
                fontFamily: FONT_STACK,
                fontSize: 17 * lay.fontScale,
                color: BRAND.ink,
                minHeight: 44 * lay.fontScale,
                display: "flex",
                alignItems: "center",
              }}
            >
              <span style={{ color: BRAND.grey, fontSize: 13 * lay.fontScale, marginRight: 10 * lay.fontScale }}>
                {label}
              </span>
              <span
                style={{
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                  opacity: fill > 0 ? 1 : 0.35,
                }}
              >
                {text.slice(0, Math.floor(text.length * fill))}
                {fill > 0 && fill < 1 && <span style={{ opacity: 0.6 }}>▌</span>}
              </span>
            </div>
          );
        })}
        <div
          style={{
            marginTop: 4 * lay.fontScale,
            background: GRADIENT,
            color: "#fff",
            fontFamily: FONT_STACK,
            fontWeight: 800,
            fontSize: 18 * lay.fontScale,
            borderRadius: 999,
            padding: `${12 * lay.fontScale}px 0`,
            textAlign: "center",
            transform: `scale(${press})`,
          }}
        >
          Reserve slots &amp; continue
        </div>
        <div
          style={{
            alignSelf: "center",
            fontFamily: FONT_STACK,
            fontWeight: 800,
            fontSize: 17 * lay.fontScale,
            color: BRAND.gold,
            background: "rgba(255,216,107,0.15)",
            border: `2px solid ${BRAND.gold}`,
            borderRadius: 999,
            padding: `${6 * lay.fontScale}px ${18 * lay.fontScale}px`,
            transform: `scale(${holdIn})`,
            opacity: holdIn,
          }}
        >
          ⏱ Slots held — 14:32 left
        </div>
      </div>
    </StepFrame>
  );
};

/** Step 4 visual: payment method rows, tap-to-copy flash, QR, receipt upload. */
const PayScene: React.FC<{ aspect: AdProps["aspect"] }> = ({ aspect }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lay = layoutFor(aspect);
  const methods = [
    { icon: "👛", name: "GCash", num: "0917 000 0001" },
    { icon: "💳", name: "Maya", num: "Maya acct 8822" },
    { icon: "🏦", name: "UnionBank", num: "0012-3456-789" },
  ];
  const copyFlash = interpolate(frame, [60, 70, 95], [0, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const uploadIn = spring({ frame: frame - 105, fps, config: { damping: 12, stiffness: 180 } });
  const qrPop = spring({ frame: frame - 120, fps, config: { damping: 11, stiffness: 200 } });
  return (
    <StepFrame
      aspect={aspect}
      n={4}
      title="Pay & Prove It"
      caption="Pay the venue direct — upload your receipt. Done."
    >
      <div
        style={{
          width: 460 * lay.fontScale,
          background: "#fff",
          borderRadius: 22,
          padding: `${20 * lay.fontScale}px`,
          boxShadow: "0 16px 44px rgba(0,0,0,0.3)",
          display: "flex",
          flexDirection: "column",
          gap: 10 * lay.fontScale,
        }}
      >
        {methods.map((m, i) => {
          const slide = interpolate(frame, [10 + i * 12, 32 + i * 12], [-60, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          return (
            <div
              key={m.name}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12 * lay.fontScale,
                border: `2px solid ${i === 0 ? BRAND.purpleTo : "#ececf1"}`,
                borderRadius: 16,
                padding: `${10 * lay.fontScale}px ${14 * lay.fontScale}px`,
                transform: `translateX(${slide}px)`,
                background: i === 0 ? "rgba(118,75,162,0.06)" : "#fff",
              }}
            >
              <span style={{ fontSize: 26 * lay.fontScale }}>{m.icon}</span>
              <div style={{ fontFamily: FONT_STACK }}>
                <div style={{ fontWeight: 800, fontSize: 17 * lay.fontScale, color: BRAND.ink }}>
                  {m.name}
                </div>
                <div
                  style={{
                    fontWeight: 800,
                    fontSize: 15 * lay.fontScale,
                    color: BRAND.purpleTo,
                    position: "relative",
                  }}
                >
                  {m.num}
                  {i === 0 && (
                    <span
                      style={{
                        position: "absolute",
                        left: 0,
                        right: 0,
                        top: 0,
                        bottom: 0,
                        background: "rgba(118,75,162,0.25)",
                        borderRadius: 4,
                        opacity: copyFlash,
                      }}
                    />
                  )}
                </div>
              </div>
              {i === 0 && (
                <span
                  style={{
                    marginLeft: "auto",
                    fontFamily: FONT_STACK,
                    fontWeight: 700,
                    fontSize: 14 * lay.fontScale,
                    color: BRAND.purpleTo,
                    opacity: copyFlash,
                  }}
                >
                  ✓ Copied
                </span>
              )}
            </div>
          );
        })}
        {/* QR + receipt row */}
        <div
          style={{
            display: "flex",
            gap: 12 * lay.fontScale,
            alignItems: "center",
            marginTop: 4 * lay.fontScale,
          }}
        >
          <div
            style={{
              width: 84 * lay.fontScale,
              height: 84 * lay.fontScale,
              borderRadius: 14,
              background: "#fff",
              border: `2px solid #ececf1`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 44 * lay.fontScale,
              transform: `scale(${qrPop})`,
              boxShadow: "0 8px 22px rgba(0,0,0,0.18)",
            }}
          >
            ⬛
          </div>
          <div
            style={{
              flex: 1,
              border: `2px dashed ${BRAND.purpleTo}`,
              borderRadius: 16,
              padding: `${12 * lay.fontScale}px`,
              fontFamily: FONT_STACK,
              fontWeight: 700,
              fontSize: 16 * lay.fontScale,
              color: BRAND.purpleTo,
              textAlign: "center",
              transform: `scale(${uploadIn})`,
              opacity: uploadIn,
            }}
          >
            📎 Receipt screenshot
            <div style={{ fontWeight: 500, fontSize: 13 * lay.fontScale, color: BRAND.grey, marginTop: 4 * lay.fontScale }}>
              tap to upload
            </div>
          </div>
        </div>
      </div>
    </StepFrame>
  );
};

/** Step 5 visual: booking ref chip + green check + add-to-calendar. */
const ConfirmScene: React.FC<{ aspect: AdProps["aspect"] }> = ({ aspect }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lay = layoutFor(aspect);
  const check = spring({ frame, fps, config: { damping: 10, stiffness: 180 } });
  const chipIn = spring({ frame: frame - 20, fps, config: { damping: 12, stiffness: 170 } });
  const calIn = spring({ frame: frame - 45, fps, config: { damping: 13, stiffness: 160 } });
  return (
    <StepFrame
      aspect={aspect}
      n={5}
      title="You're Booked"
      caption="Venue verifies — your slot is confirmed."
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 20 * lay.fontScale,
        }}
      >
        <div
          style={{
            width: 110 * lay.fontScale,
            height: 110 * lay.fontScale,
            borderRadius: "50%",
            background: BRAND.good,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 60 * lay.fontScale,
            color: "#fff",
            transform: `scale(${check})`,
            boxShadow: "0 14px 36px rgba(34,197,94,0.4)",
          }}
        >
          ✓
        </div>
        <div
          style={{
            fontFamily: FONT_STACK,
            fontWeight: 900,
            fontSize: 34 * lay.fontScale,
            color: BRAND.purpleTo,
            background: "#fff",
            borderRadius: 999,
            padding: `${10 * lay.fontScale}px ${30 * lay.fontScale}px`,
            transform: `scale(${chipIn})`,
            opacity: chipIn,
            boxShadow: "0 10px 26px rgba(0,0,0,0.2)",
          }}
        >
          BK-2026-0100
        </div>
        <div
          style={{
            fontFamily: FONT_STACK,
            fontWeight: 700,
            fontSize: 19 * lay.fontScale,
            color: "#fff",
            background: "rgba(255,255,255,0.14)",
            border: `2px solid rgba(255,255,255,0.4)`,
            borderRadius: 999,
            padding: `${9 * lay.fontScale}px ${24 * lay.fontScale}px`,
            transform: `scale(${calIn})`,
            opacity: calIn,
          }}
        >
          📅 Add to calendar
        </div>
      </div>
    </StepFrame>
  );
};

export const BookGuideAd: React.FC<BookGuideProps> = ({
  aspect,
  voiceoverFile,
  cut = "full",
}) => {
  const c = CUTS[cut];
  const scene = (i: number) => c.at[i + 1] - c.at[i];
  return (
    <AbsoluteFill>
      <BrandBackground />
      <Sequence durationInFrames={c.at[1]}>
        <IntroScene aspect={aspect} />
      </Sequence>
      <Sequence from={c.at[1]} durationInFrames={scene(1)}>
        <VenueScene aspect={aspect} />
      </Sequence>
      <Sequence from={c.at[2]} durationInFrames={scene(2)}>
        <SlotScene aspect={aspect} />
      </Sequence>
      <Sequence from={c.at[3]} durationInFrames={scene(3)}>
        <DetailsScene aspect={aspect} />
      </Sequence>
      <Sequence from={c.at[4]} durationInFrames={scene(4)}>
        <PayScene aspect={aspect} />
      </Sequence>
      <Sequence from={c.at[5]} durationInFrames={scene(5)}>
        <ConfirmScene aspect={aspect} />
      </Sequence>
      <Sequence from={c.at[6]} durationInFrames={c.outroLen}>
        <AbsoluteFill
          style={{ justifyContent: "center", alignItems: "center" }}
        >
          <AdCtaOutro
            tagline="Book your next game — fast, fair, online."
            cta="dinkmatch.club/book"
            scale={layoutFor(aspect).fontScale}
          />
        </AbsoluteFill>
      </Sequence>
      <AdAudio lines={cut === "short" ? VO_SHORT : VO_FULL} voiceoverFile={voiceoverFile} />
    </AbsoluteFill>
  );
};
