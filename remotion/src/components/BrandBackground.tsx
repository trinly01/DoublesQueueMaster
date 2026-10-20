import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { GRADIENT } from "../theme";

/** Animated purple gradient + faint court geometry + drifting ball glow. */
export const BrandBackground: React.FC<{ dim?: number }> = ({ dim = 0 }) => {
  const frame = useCurrentFrame();
  const drift = interpolate(frame, [0, 450], [0, 60]);
  return (
    <AbsoluteFill style={{ background: GRADIENT }}>
      {/* soft moving glow */}
      <div
        style={{
          position: "absolute",
          width: "140%",
          height: "140%",
          left: "-20%",
          top: "-20%",
          background:
            "radial-gradient(ellipse at 30% 20%, rgba(255,216,107,0.16), transparent 55%), radial-gradient(ellipse at 75% 85%, rgba(255,255,255,0.10), transparent 50%)",
          transform: `translateY(${-drift}px)`,
        }}
      />
      {/* faint court outline */}
      <div
        style={{
          position: "absolute",
          inset: "18% 12%",
          border: "3px solid rgba(255,255,255,0.10)",
          borderRadius: 12,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "12%",
          right: "12%",
          top: "50%",
          height: 3,
          background: "rgba(255,255,255,0.10)",
        }}
      />
      {dim > 0 && <AbsoluteFill style={{ background: `rgba(0,0,0,${dim})` }} />}
    </AbsoluteFill>
  );
};
