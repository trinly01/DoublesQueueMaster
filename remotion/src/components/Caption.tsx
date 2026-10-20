import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import { BRAND, FONT_STACK } from "../theme";

/**
 * Bold kinetic caption — pops in with a spring, readable sound-off.
 * `tone: "light"` for dark backgrounds, `"dark"` for light cards.
 */
export const Caption: React.FC<{
  text: string;
  from?: number;
  size?: number;
  tone?: "light" | "dark" | "gold";
  align?: React.CSSProperties["textAlign"];
}> = ({ text, from = 0, size = 64, tone = "light", align = "center" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame - from;
  const pop = spring({
    frame: local,
    fps,
    config: { damping: 14, stiffness: 160 },
  });
  if (local < 0) return null;
  const color =
    tone === "gold" ? BRAND.gold : tone === "dark" ? BRAND.ink : "#fff";
  return (
    <div
      style={{
        fontFamily: FONT_STACK,
        fontWeight: 800,
        fontSize: size,
        lineHeight: 1.15,
        textAlign: align,
        color,
        textShadow:
          tone === "light"
            ? "0 2px 24px rgba(0,0,0,0.35)"
            : "0 1px 0 rgba(255,255,255,0.4)",
        transform: `scale(${0.7 + pop * 0.3}) translateY(${(1 - pop) * 30}px)`,
        opacity: pop,
      }}
    >
      {text}
    </div>
  );
};
