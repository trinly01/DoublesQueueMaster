/**
 * DinkMatch brand tokens — mirror src/components/landing + quasar.variables.scss
 * so the ads look like the product, not a generic motion template.
 */
export const BRAND = {
  purpleFrom: "#667eea",
  purpleTo: "#764ba2",
  gold: "#ffd86b",
  ink: "#2d2d3a",
  soft: "#f5f7fa",
  paper: "#ffffff",
  good: "#22c55e",
  bad: "#ef4444",
  grey: "#6b7280",
};

export const GRADIENT = `linear-gradient(135deg, ${BRAND.purpleFrom} 0%, ${BRAND.purpleTo} 100%)`;

/** Same skill-tier colors as LandingPaddleStack.vue skill dots. */
export const SKILL_COLORS = {
  beginner: "#22c55e",
  intermediate: "#eab308",
  advanced: "#ef4444",
} as const;
export type SkillTier = keyof typeof SKILL_COLORS;

export type Aspect = "9:16" | "1:1" | "16:9";

export interface AdProps {
  aspect: Aspect;
  /** Optional human voiceover file under public/vo/ — e.g. "vo/ad1.mp3". */
  voiceoverFile?: string;
}

export const AD_FPS = 30;
/** 18 seconds at 30fps — ~15s of story + 3s CTA hold. */
export const AD_DURATION = 540;

export const AD_DIMS: Record<Aspect, { width: number; height: number }> = {
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
  "16:9": { width: 1920, height: 1080 },
};

/** Per-aspect layout hints shared by all ads. */
export const layoutFor = (aspect: Aspect) => ({
  isVertical: aspect === "9:16",
  isSquare: aspect === "1:1",
  isWide: aspect === "16:9",
  /** Split scenes stack vertically on 9:16, side-by-side otherwise. */
  splitDirection: aspect === "9:16" ? ("column" as const) : ("row" as const),
  /** Global type scale — vertical gets bigger type for phone feeds. */
  fontScale: aspect === "9:16" ? 1.15 : aspect === "1:1" ? 1 : 0.95,
  pad: aspect === "9:16" ? 64 : aspect === "1:1" ? 56 : 72,
});

export const FONT_STACK = "Roboto, Arial, sans-serif";
