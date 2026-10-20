import {
  Img,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { BRAND, FONT_STACK } from "../theme";

/** Branded outro — logo, tagline, CTA pill. Used as the last beat of every ad. */
export const AdCtaOutro: React.FC<{
  tagline: string;
  cta?: string;
  scale?: number;
}> = ({ tagline, cta = "Try free — no sign up", scale = 1 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 13, stiffness: 140 } });
  const pill = spring({
    frame: frame - 10,
    fps,
    config: { damping: 14, stiffness: 160 },
  });
  // gentle breathing pulse during the end-card hold (~1.2s cycle)
  const breathe = 1 + Math.sin(frame / 1.15) * 0.025;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 22 * scale,
        transform: `scale(${0.8 + pop * 0.2})`,
        opacity: pop,
        fontFamily: FONT_STACK,
      }}
    >
      <Img
        src={staticFile("logo.png")}
        style={{
          width: 130 * scale,
          height: 130 * scale,
          objectFit: "contain",
        }}
      />
      <div
        style={{
          fontSize: 68 * scale,
          fontWeight: 900,
          color: "#fff",
          letterSpacing: -1,
          textShadow: "0 3px 26px rgba(0,0,0,0.35)",
        }}
      >
        DinkMatch
      </div>
      <div
        style={{
          fontSize: 34 * scale,
          fontWeight: 700,
          color: BRAND.gold,
          textAlign: "center",
          textShadow: "0 2px 16px rgba(0,0,0,0.3)",
        }}
      >
        {tagline}
      </div>
      <div
        style={{
          background: "#fff",
          color: BRAND.purpleTo,
          fontWeight: 800,
          fontSize: 30 * scale,
          borderRadius: 999,
          padding: `${16 * scale}px ${44 * scale}px`,
          transform: `scale(${(0.8 + pill * 0.2) * breathe})`,
          opacity: pill,
          boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
        }}
      >
        {cta} →
      </div>
      <div
        style={{
          color: "rgba(255,255,255,0.8)",
          fontSize: 20 * scale,
          fontWeight: 600,
        }}
      >
        📱 Scan the QR — in the game in seconds · dinkmatch.com
      </div>
    </div>
  );
};
