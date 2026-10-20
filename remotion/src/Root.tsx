import { Composition } from "remotion";
import "./index.css";
import { AD_DIMS, AD_DURATION, AD_FPS, AdProps, Aspect } from "./theme";
import { WalkingPaddleAd } from "./ads/WalkingPaddleAd";
import { ZeroPoliticsAd } from "./ads/ZeroPoliticsAd";
import { EveryGameCountsAd } from "./ads/EveryGameCountsAd";

const ADS: { id: string; comp: React.FC<AdProps> }[] = [
  { id: "WalkingPaddle", comp: WalkingPaddleAd },
  { id: "ZeroPolitics", comp: ZeroPoliticsAd },
  { id: "EveryGameCounts", comp: EveryGameCountsAd },
];

const ASPECTS: { key: Aspect; suffix: string }[] = [
  { key: "9:16", suffix: "9x16" },
  { key: "1:1", suffix: "1x1" },
  { key: "16:9", suffix: "16x9" },
];

export const RemotionRoot: React.FC = () => (
  <>
    {ADS.flatMap(({ id, comp }) =>
      ASPECTS.map(({ key, suffix }) => (
        <Composition
          key={`${id}-${suffix}`}
          id={`${id}-${suffix}`}
          component={comp as unknown as React.FC<Record<string, unknown>>}
          durationInFrames={AD_DURATION}
          fps={AD_FPS}
          width={AD_DIMS[key].width}
          height={AD_DIMS[key].height}
          defaultProps={{ aspect: key } satisfies AdProps}
        />
      )),
    )}
  </>
);
