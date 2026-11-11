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

/**
 * Venue-owner pitch — admin dashboard, insights, payments, plans, CTA.
 * Scenes at 0 / 90 / 270 / 450 / 600 (outro). ~24.5s.
 */
const VO_LINES = [
  { at: 5, file: "vn_hook" },
  { at: 110, file: "vn_dash" },
  { at: 285, file: "vn_insights" },
  { at: 458, file: "vn_pay" },
  { at: 618, file: "vn_outro" },
];

/** Hook — bold statement card. */
const HookScene: React.FC<{ aspect: AdProps["aspect"] }> = ({ aspect }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lay = layoutFor(aspect);
  const pop = spring({ frame, fps, config: { damping: 12, stiffness: 150 } });
  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        gap: 34 * lay.fontScale,
        padding: lay.pad,
      }}
    >
      <div
        style={{
          fontFamily: FONT_STACK,
          fontWeight: 900,
          fontSize: 66 * lay.fontScale,
          color: "#fff",
          textAlign: "center",
          lineHeight: 1.15,
          transform: `scale(${0.85 + pop * 0.15})`,
          opacity: pop,
          textShadow: "0 4px 30px rgba(0,0,0,0.35)",
        }}
      >
        Your venue.
        <br />
        Your bookings.
        <br />
        <span style={{ color: BRAND.gold }}>Zero hassle.</span>
      </div>
      <Caption
        text="The booking system venues actually use"
        size={32 * lay.fontScale}
        tone="gold"
        from={25}
      />
    </AbsoluteFill>
  );
};

/** Beat 1: venue admin bookings dashboard — rows slide in, chips tick. */
const DashboardScene: React.FC<{ aspect: AdProps["aspect"] }> = ({ aspect }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lay = layoutFor(aspect);
  const rows = [
    { ref: "BK-2026-0100", who: "Juan D.", when: "Today 13:00", chip: "verifying", chipColor: "#f59e0b" },
    { ref: "BK-2026-0099", who: "Maria S.", when: "Today 15:00", chip: "confirmed", chipColor: "#22c55e" },
    { ref: "BK-2026-0098", who: "Paolo R.", when: "Tomorrow 09:00", chip: "held", chipColor: "#3b82f6" },
    { ref: "BK-2026-0097", who: "Ana L.", when: "Tomorrow 11:00", chip: "confirmed", chipColor: "#22c55e" },
  ];
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
          gap: 18 * lay.fontScale,
        }}
      >
        <div
          style={{
            width: 64 * lay.fontScale,
            height: 64 * lay.fontScale,
            borderRadius: 16,
            background: GRADIENT,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 30 * lay.fontScale,
          }}
        >
          🏟️
        </div>
        <Caption text="Manage it all in one dashboard" size={46 * lay.fontScale} tone="gold" align="left" />
      </div>
      <div
        style={{
          width: 620 * lay.fontScale,
          maxWidth: "92%",
          background: "#fff",
          borderRadius: 20,
          padding: `${14 * lay.fontScale}px`,
          boxShadow: "0 18px 48px rgba(0,0,0,0.32)",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.2fr 1fr 1fr auto",
            gap: 10 * lay.fontScale,
            fontFamily: FONT_STACK,
            fontSize: 13 * lay.fontScale,
            fontWeight: 800,
            color: BRAND.grey,
            padding: `0 ${10 * lay.fontScale}px ${8 * lay.fontScale}px`,
            textTransform: "uppercase",
            letterSpacing: 1,
          }}
        >
          <span>Ref</span><span>Customer</span><span>When</span><span>Status</span>
        </div>
        {rows.map((r, i) => {
          const slide = interpolate(frame, [12 + i * 12, 34 + i * 12], [-60, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const chipPop = spring({ frame: frame - 34 - i * 12, fps, config: { damping: 11, stiffness: 200 } });
          return (
            <div
              key={r.ref}
              style={{
                display: "grid",
                gridTemplateColumns: "1.2fr 1fr 1fr auto",
                gap: 10 * lay.fontScale,
                alignItems: "center",
                fontFamily: FONT_STACK,
                fontSize: 17 * lay.fontScale,
                fontWeight: 600,
                color: BRAND.ink,
                background: "#f8f8fb",
                borderRadius: 12,
                padding: `${10 * lay.fontScale}px`,
                marginBottom: 8 * lay.fontScale,
                transform: `translateX(${slide}px)`,
              }}
            >
              <span style={{ fontWeight: 800, color: BRAND.purpleTo }}>{r.ref}</span>
              <span>{r.who}</span>
              <span style={{ color: BRAND.grey }}>{r.when}</span>
              <span
                style={{
                  fontSize: 13 * lay.fontScale,
                  fontWeight: 800,
                  color: "#fff",
                  background: r.chipColor,
                  borderRadius: 999,
                  padding: `${4 * lay.fontScale}px ${12 * lay.fontScale}px`,
                  transform: `scale(${chipPop})`,
                  opacity: chipPop,
                }}
              >
                {r.chip}
              </span>
            </div>
          );
        })}
      </div>
      <Caption
        text="Bookings, proofs, courts — one dashboard"
        size={30 * lay.fontScale}
      />
    </AbsoluteFill>
  );
};

/** Beat 2: live insights — metric chips + animated bar/line charts. */
const InsightsScene: React.FC<{ aspect: AdProps["aspect"] }> = ({ aspect }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lay = layoutFor(aspect);

  const stats = [
    { label: "Bookings", value: "86", suffix: "" },
    { label: "Revenue", value: "₱12.4", suffix: "k" },
    { label: "Courts booked", value: "72", suffix: "%" },
  ];
  const bars = [42, 68, 55, 80, 62, 90, 74]; // Mon..Sun relative heights
  const linePts = [10, 22, 15, 30, 26, 40, 34]; // revenue trend

  const card: React.CSSProperties = {
    background: "#fff",
    borderRadius: 22,
    padding: `${18 * lay.fontScale}px`,
    boxShadow: "0 16px 44px rgba(0,0,0,0.3)",
  };

  return (
    <AbsoluteFill
      style={{
        padding: lay.pad,
        justifyContent: "center",
        alignItems: "center",
        gap: 26 * lay.fontScale,
      }}
    >
      <Caption text="Your numbers, live" size={46 * lay.fontScale} tone="gold" />

      {/* stat chips */}
      <div style={{ display: "flex", gap: 14 * lay.fontScale }}>
        {stats.map((s, i) => {
          const pop = spring({ frame: frame - 8 - i * 8, fps, config: { damping: 12, stiffness: 190 } });
          return (
            <div
              key={s.label}
              style={{
                ...card,
                width: 170 * lay.fontScale,
                padding: `${12 * lay.fontScale}px ${14 * lay.fontScale}px`,
                textAlign: "center",
                transform: `scale(${pop})`,
                opacity: pop,
              }}
            >
              <div
                style={{
                  fontFamily: FONT_STACK,
                  fontWeight: 900,
                  fontSize: 30 * lay.fontScale,
                  color: BRAND.purpleTo,
                }}
              >
                {s.value}
                {s.suffix}
              </div>
              <div
                style={{
                  fontFamily: FONT_STACK,
                  fontWeight: 700,
                  fontSize: 13 * lay.fontScale,
                  color: BRAND.grey,
                  textTransform: "uppercase",
                  letterSpacing: 1,
                }}
              >
                {s.label}
              </div>
            </div>
          );
        })}
      </div>

      {/* charts row */}
      <div
        style={{
          display: "flex",
          flexDirection: lay.isWide ? "row" : "column",
          gap: 24 * lay.fontScale,
          alignItems: "stretch",
        }}
      >
        {/* bookings per day — bars */}
        <div style={{ ...card, width: 400 * lay.fontScale, maxWidth: "92%" }}>
          <div
            style={{
              fontFamily: FONT_STACK,
              fontWeight: 800,
              fontSize: 15 * lay.fontScale,
              color: BRAND.grey,
              marginBottom: 14 * lay.fontScale,
              textTransform: "uppercase",
              letterSpacing: 1,
            }}
          >
            Bookings this week
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: 10 * lay.fontScale,
              height: 150 * lay.fontScale,
            }}
          >
            {bars.map((h, i) => {
              const grow = interpolate(frame, [20 + i * 6, 50 + i * 6], [0, h], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              });
              return (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    height: `${grow}%`,
                    borderRadius: 8,
                    background: GRADIENT,
                    opacity: 0.9,
                  }}
                />
              );
            })}
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontFamily: FONT_STACK,
              fontSize: 11 * lay.fontScale,
              color: BRAND.grey,
              marginTop: 8 * lay.fontScale,
            }}
          >
            {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
              <span key={i}>{d}</span>
            ))}
          </div>
        </div>

        {/* revenue trend — area line */}
        <div style={{ ...card, width: 400 * lay.fontScale, maxWidth: "92%" }}>
          <div
            style={{
              fontFamily: FONT_STACK,
              fontWeight: 800,
              fontSize: 15 * lay.fontScale,
              color: BRAND.grey,
              marginBottom: 14 * lay.fontScale,
              textTransform: "uppercase",
              letterSpacing: 1,
            }}
          >
            Revenue trend
          </div>
          <svg
            viewBox="0 0 100 50"
            style={{ width: "100%", height: 150 * lay.fontScale, display: "block" }}
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={BRAND.purpleTo} stopOpacity="0.35" />
                <stop offset="100%" stopColor={BRAND.purpleTo} stopOpacity="0" />
              </linearGradient>
            </defs>
            <polygon
              points={`0,50 ${linePts.map((p, i) => `${(i / 6) * 100},${50 - p}`).join(" ")} 100,50`}
              fill="url(#revFill)"
              opacity={interpolate(frame, [30, 80], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}
            />
            <polyline
              points={linePts.map((p, i) => `${(i / 6) * 100},${50 - p}`).join(" ")}
              fill="none"
              stroke={BRAND.purpleTo}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={interpolate(frame, [20, 90], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}
            />
          </svg>
        </div>
      </div>
      <Caption
        text="Live insights — your venue, your data"
        size={30 * lay.fontScale}
      />
    </AbsoluteFill>
  );
};

/** Beat 3: payment methods + subscription plans. */
const PlansScene: React.FC<{ aspect: AdProps["aspect"] }> = ({ aspect }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lay = layoutFor(aspect);
  const methods = [
    { icon: "👛", name: "GCash", num: "0917 000 0001" },
    { icon: "💳", name: "Maya" },
    { icon: "🏦", name: "UnionBank" },
  ];
  const plans = [
    { name: "Trial", price: "₱0 · 30 days", hot: false },
    { name: "Starter", price: "₱499/mo", hot: false },
    { name: "Growth", price: "₱999/mo", hot: true },
  ];
  return (
    <AbsoluteFill
      style={{
        padding: lay.pad,
        justifyContent: "center",
        alignItems: "center",
        gap: 30 * lay.fontScale,
      }}
    >
      <Caption text="Get paid your way" size={44 * lay.fontScale} tone="gold" />
      <div
        style={{
          display: "flex",
          flexDirection: lay.isWide ? "row" : "column",
          gap: 24 * lay.fontScale,
          alignItems: "center",
        }}
      >
        {/* payment methods card */}
        <div
          style={{
            width: 340 * lay.fontScale,
            background: "#fff",
            borderRadius: 22,
            padding: `${18 * lay.fontScale}px`,
            boxShadow: "0 16px 44px rgba(0,0,0,0.3)",
          }}
        >
          <div
            style={{
              fontFamily: FONT_STACK,
              fontWeight: 800,
              fontSize: 16 * lay.fontScale,
              color: BRAND.grey,
              marginBottom: 12 * lay.fontScale,
              textTransform: "uppercase",
              letterSpacing: 1,
            }}
          >
            Payment methods
          </div>
          {methods.map((m, i) => (
            <div
              key={m.name}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10 * lay.fontScale,
                padding: `${8 * lay.fontScale}px 0`,
                borderBottom: i < methods.length - 1 ? "1px solid #eee" : "none",
              }}
            >
              <span style={{ fontSize: 24 * lay.fontScale }}>{m.icon}</span>
              <span style={{ fontFamily: FONT_STACK, fontWeight: 700, fontSize: 18 * lay.fontScale, color: BRAND.ink }}>
                {m.name}
              </span>
              {m.num && (
                <span style={{ marginLeft: "auto", fontFamily: FONT_STACK, fontWeight: 800, fontSize: 15 * lay.fontScale, color: BRAND.purpleTo }}>
                  {m.num}
                </span>
              )}
            </div>
          ))}
        </div>
        {/* plans card */}
        <div
          style={{
            width: 340 * lay.fontScale,
            background: "#fff",
            borderRadius: 22,
            padding: `${18 * lay.fontScale}px`,
            boxShadow: "0 16px 44px rgba(0,0,0,0.3)",
          }}
        >
          <div
            style={{
              fontFamily: FONT_STACK,
              fontWeight: 800,
              fontSize: 16 * lay.fontScale,
              color: BRAND.grey,
              marginBottom: 12 * lay.fontScale,
              textTransform: "uppercase",
              letterSpacing: 1,
            }}
          >
            Plans
          </div>
          {plans.map((p, i) => {
            const pop = spring({ frame: frame - 15 - i * 12, fps, config: { damping: 12, stiffness: 190 } });
            return (
              <div
                key={p.name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: `${10 * lay.fontScale}px ${14 * lay.fontScale}px`,
                  borderRadius: 14,
                  marginBottom: 8 * lay.fontScale,
                  background: p.hot ? "rgba(118,75,162,0.1)" : "#f8f8fb",
                  border: p.hot ? `2px solid ${BRAND.purpleTo}` : "2px solid transparent",
                  transform: `scale(${pop})`,
                  opacity: pop,
                }}
              >
                <span style={{ fontFamily: FONT_STACK, fontWeight: 800, fontSize: 18 * lay.fontScale, color: BRAND.ink }}>
                  {p.name}
                </span>
                <span style={{ fontFamily: FONT_STACK, fontWeight: 800, fontSize: 17 * lay.fontScale, color: p.hot ? BRAND.purpleTo : BRAND.grey }}>
                  {p.price}
                </span>
              </div>
            );
          })}
          <div
            style={{
              marginTop: 10 * lay.fontScale,
              fontFamily: FONT_STACK,
              fontWeight: 700,
              fontSize: 14 * lay.fontScale,
              color: BRAND.good,
              textAlign: "center",
            }}
          >
            ✓ Free 30-day trial — no card needed
          </div>
        </div>
      </div>
      <Caption
        text="GCash, Maya, bank — customers pay you direct"
        size={30 * lay.fontScale}
      />
    </AbsoluteFill>
  );
};

export const VenueAd: React.FC<AdProps> = ({ aspect, voiceoverFile }) => (
  <AbsoluteFill>
    <BrandBackground />
    <Sequence durationInFrames={90}>
      <HookScene aspect={aspect} />
    </Sequence>
    <Sequence from={90} durationInFrames={180}>
      <DashboardScene aspect={aspect} />
    </Sequence>
    <Sequence from={270} durationInFrames={180}>
      <InsightsScene aspect={aspect} />
    </Sequence>
    <Sequence from={450} durationInFrames={150}>
      <PlansScene aspect={aspect} />
    </Sequence>
    <Sequence from={600} durationInFrames={135}>
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <AdCtaOutro
          tagline="List your venue — start your free trial."
          cta="dinkmatch.club"
          scale={layoutFor(aspect).fontScale}
        />
      </AbsoluteFill>
    </Sequence>
    <AdAudio lines={VO_LINES} voiceoverFile={voiceoverFile} />
  </AbsoluteFill>
);
