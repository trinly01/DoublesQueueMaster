import { BRAND, SKILL_COLORS, SkillTier, FONT_STACK } from "../theme";

/**
 * Faithful React recreation of the queue/paddle chip — avatar circle with
 * initial, skill dot, name, and optional 🔒 / 🔗 / 🚫 corner badges.
 */
export const PlayerChip: React.FC<{
  name: string;
  skill?: SkillTier;
  rating?: number;
  lock?: boolean;
  link?: boolean;
  avoid?: boolean;
  size?: number;
  width?: number; // fixed chip width — keeps all chips uniform
  dimmed?: boolean;
}> = ({
  name,
  skill = "intermediate",
  rating,
  lock,
  link,
  avoid,
  size = 64,
  width,
  dimmed,
}) => {
  const dot = SKILL_COLORS[skill];
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: size * 0.22,
        width: width ?? "auto",
        background: "rgba(255,255,255,0.95)",
        borderRadius: size * 0.5,
        padding: `${size * 0.12}px ${size * 0.3}px ${size * 0.12}px ${size * 0.12}px`,
        boxShadow: "0 4px 14px rgba(0,0,0,0.18)",
        opacity: dimmed ? 0.55 : 1,
        position: "relative",
      }}
    >
      <div
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: BRAND.purpleFrom,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          fontFamily: FONT_STACK,
          fontWeight: 800,
          fontSize: size * 0.42,
          position: "relative",
        }}
      >
        {name[0]}
        {/* skill dot bottom-right of avatar */}
        <div
          style={{
            position: "absolute",
            right: -2,
            bottom: -2,
            width: size * 0.26,
            height: size * 0.26,
            borderRadius: "50%",
            background: dot,
            border: "2px solid #fff",
          }}
        />
        {/* avoid badge bottom-left — admin/mod only in-app */}
        {avoid && (
          <div
            style={{
              position: "absolute",
              left: -4,
              bottom: -4,
              width: size * 0.34,
              height: size * 0.34,
              borderRadius: "50%",
              background: "#f97316",
              border: "2px solid #fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: size * 0.2,
            }}
          >
            🚫
          </div>
        )}
      </div>
      <div
        style={{
          fontFamily: FONT_STACK,
          fontWeight: 700,
          fontSize: size * 0.34,
          color: BRAND.ink,
          flex: 1,
          minWidth: 0,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {name}
        {rating != null && (
          <span
            style={{
              color: BRAND.grey,
              fontWeight: 500,
              fontSize: size * 0.26,
            }}
          >
            {"  "}
            {rating}
          </span>
        )}
      </div>
      {lock && <span style={{ fontSize: size * 0.34 }}>🔒</span>}
      {link && <span style={{ fontSize: size * 0.34 }}>🔗</span>}
    </div>
  );
};
