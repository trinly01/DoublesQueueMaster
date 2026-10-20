import { BRAND, FONT_STACK, SkillTier } from "../theme";
import { PlayerChip } from "./PlayerChip";

export interface TeamSlot {
  name: string;
  skill: SkillTier;
  rating?: number;
  lock?: boolean;
  link?: boolean;
  avoid?: boolean;
}

/** Court card: label, Team A chips vs Team B chips, win-prob bar, caption. */
export const CourtMatchCard: React.FC<{
  label: string;
  teamA: TeamSlot[];
  teamB: TeamSlot[];
  winProbA?: number; // 0..100
  mode?: string;
  caption?: string;
  captionTone?: "good" | "bad" | "neutral";
  scale?: number;
}> = ({
  label,
  teamA,
  teamB,
  winProbA,
  mode,
  caption,
  captionTone = "neutral",
  scale = 1,
}) => {
  const captionBg =
    captionTone === "good"
      ? "rgba(34,197,94,0.14)"
      : captionTone === "bad"
        ? "rgba(239,68,68,0.14)"
        : "rgba(102,126,234,0.10)";
  const captionColor =
    captionTone === "good"
      ? "#15803d"
      : captionTone === "bad"
        ? "#b91c1c"
        : BRAND.purpleTo;
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 22 * scale,
        padding: 22 * scale,
        boxShadow: "0 16px 40px rgba(0,0,0,0.22)",
        fontFamily: FONT_STACK,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 14 * scale,
        }}
      >
        <div
          style={{ fontWeight: 800, fontSize: 28 * scale, color: BRAND.ink }}
        >
          {label}
        </div>
        {mode && (
          <div
            style={{
              background: `linear-gradient(135deg, ${BRAND.purpleFrom}, ${BRAND.purpleTo})`,
              color: "#fff",
              fontWeight: 700,
              fontSize: 19 * scale,
              borderRadius: 999,
              padding: `${7 * scale}px ${18 * scale}px`,
            }}
          >
            {mode}
          </div>
        )}
      </div>

      {/* side-by-side teams like the app's TeamArrangement: A | net/VS | B */}
      <div
        style={{
          display: "flex",
          alignItems: "stretch",
          background: "rgba(102,126,234,0.06)",
          borderRadius: 14 * scale,
          padding: `${10 * scale}px ${12 * scale}px`,
        }}
      >
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            justifyContent: "center",
            gap: 10 * scale,
          }}
        >
          {teamA.map((p) => (
            <PlayerChip
              key={p.name}
              {...p}
              size={56 * scale}
              width={240 * scale}
            />
          ))}
        </div>
        {/* net divider + VS badge */}
        <div
          style={{
            position: "relative",
            width: 0,
            borderLeft: `2px dashed rgba(102,126,234,0.35)`,
            margin: `0 ${8 * scale}px`,
          }}
        >
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              background: "#fff",
              border: `2px solid rgba(102,126,234,0.35)`,
              borderRadius: 999,
              padding: `${4 * scale}px ${9 * scale}px`,
              fontWeight: 800,
              color: BRAND.purpleTo,
              fontSize: 14 * scale,
            }}
          >
            VS
          </div>
        </div>
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            justifyContent: "center",
            gap: 10 * scale,
          }}
        >
          {teamB.map((p) => (
            <PlayerChip
              key={p.name}
              {...p}
              size={56 * scale}
              width={240 * scale}
            />
          ))}
        </div>
      </div>

      {winProbA != null && (
        <div
          style={{
            marginTop: 14 * scale,
            height: 10 * scale,
            borderRadius: 999,
            background: "#e5e7eb",
            overflow: "hidden",
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              width: `${winProbA}%`,
              background: `linear-gradient(90deg, ${BRAND.purpleFrom}, ${BRAND.purpleTo})`,
            }}
          />
        </div>
      )}
      {winProbA != null && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 18 * scale,
            fontWeight: 700,
            color: BRAND.grey,
            marginTop: 4 * scale,
          }}
        >
          <span>{Math.round(winProbA)}%</span>
          <span>{Math.round(100 - winProbA)}%</span>
        </div>
      )}

      {caption && (
        <div
          style={{
            marginTop: 14 * scale,
            background: captionBg,
            color: captionColor,
            borderRadius: 12 * scale,
            padding: `${10 * scale}px ${14 * scale}px`,
            fontWeight: 700,
            fontSize: 21 * scale,
            textAlign: "center",
          }}
        >
          {caption}
        </div>
      )}
    </div>
  );
};
