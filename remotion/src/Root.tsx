import { Composition } from "remotion";
import "./index.css";
import { AD_DIMS, AD_DURATION, AD_FPS } from "./theme";
import { WalkingPaddleAd } from "./ads/WalkingPaddleAd";
import { ZeroPoliticsAd } from "./ads/ZeroPoliticsAd";
import { EveryGameCountsAd } from "./ads/EveryGameCountsAd";
import { QueueGuideAd } from "./ads/QueueGuideAd";
import { DuprOfficialAd } from "./ads/DuprOfficialAd";
import { BigScreenAd } from "./ads/BigScreenAd";

const GUIDE_DURATION = 735;
/** 22s — the Natural-voice VO needs more room than the 18s template. */
const BS_DURATION = 660;

/** Remotion's loose component signature — AdProps has required keys. */
type AdComp = React.FC<Record<string, unknown>>;
const WalkingPaddle = WalkingPaddleAd as unknown as AdComp;
const ZeroPolitics = ZeroPoliticsAd as unknown as AdComp;
const EveryGameCounts = EveryGameCountsAd as unknown as AdComp;
const QueueGuide = QueueGuideAd as unknown as AdComp;
const DuprOfficial = DuprOfficialAd as unknown as AdComp;
const BigScreen = BigScreenAd as unknown as AdComp;

/**
 * Compositions are registered literally (not in a loop) so Remotion Studio can
 * statically analyze each `id` + `defaultProps` and save prop edits back to
 * this file — see remotion.dev/docs/troubleshooting/cannot-save-default-props.
 */
export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="WalkingPaddle-9x16"
      component={WalkingPaddle}
      durationInFrames={AD_DURATION}
      fps={AD_FPS}
      width={AD_DIMS["9:16"].width}
      height={AD_DIMS["9:16"].height}
      defaultProps={{ aspect: "9:16" }}
    />
    <Composition
      id="WalkingPaddle-1x1"
      component={WalkingPaddle}
      durationInFrames={AD_DURATION}
      fps={AD_FPS}
      width={AD_DIMS["1:1"].width}
      height={AD_DIMS["1:1"].height}
      defaultProps={{ aspect: "1:1" }}
    />
    <Composition
      id="WalkingPaddle-16x9"
      component={WalkingPaddle}
      durationInFrames={AD_DURATION}
      fps={AD_FPS}
      width={AD_DIMS["16:9"].width}
      height={AD_DIMS["16:9"].height}
      defaultProps={{ aspect: "16:9" }}
    />
    <Composition
      id="ZeroPolitics-9x16"
      component={ZeroPolitics}
      durationInFrames={AD_DURATION}
      fps={AD_FPS}
      width={AD_DIMS["9:16"].width}
      height={AD_DIMS["9:16"].height}
      defaultProps={{ aspect: "9:16" }}
    />
    <Composition
      id="ZeroPolitics-1x1"
      component={ZeroPolitics}
      durationInFrames={AD_DURATION}
      fps={AD_FPS}
      width={AD_DIMS["1:1"].width}
      height={AD_DIMS["1:1"].height}
      defaultProps={{ aspect: "1:1" }}
    />
    <Composition
      id="ZeroPolitics-16x9"
      component={ZeroPolitics}
      durationInFrames={AD_DURATION}
      fps={AD_FPS}
      width={AD_DIMS["16:9"].width}
      height={AD_DIMS["16:9"].height}
      defaultProps={{ aspect: "16:9" }}
    />
    <Composition
      id="EveryGameCounts-9x16"
      component={EveryGameCounts}
      durationInFrames={AD_DURATION}
      fps={AD_FPS}
      width={AD_DIMS["9:16"].width}
      height={AD_DIMS["9:16"].height}
      defaultProps={{ aspect: "9:16" }}
    />
    <Composition
      id="EveryGameCounts-1x1"
      component={EveryGameCounts}
      durationInFrames={AD_DURATION}
      fps={AD_FPS}
      width={AD_DIMS["1:1"].width}
      height={AD_DIMS["1:1"].height}
      defaultProps={{ aspect: "1:1" }}
    />
    <Composition
      id="EveryGameCounts-16x9"
      component={EveryGameCounts}
      durationInFrames={AD_DURATION}
      fps={AD_FPS}
      width={AD_DIMS["16:9"].width}
      height={AD_DIMS["16:9"].height}
      defaultProps={{ aspect: "16:9" }}
    />
    <Composition
      id="QueueGuide-9x16"
      component={QueueGuide}
      durationInFrames={GUIDE_DURATION}
      fps={AD_FPS}
      width={AD_DIMS["9:16"].width}
      height={AD_DIMS["9:16"].height}
      defaultProps={{ aspect: "9:16" }}
    />
    <Composition
      id="QueueGuide-1x1"
      component={QueueGuide}
      durationInFrames={GUIDE_DURATION}
      fps={AD_FPS}
      width={AD_DIMS["1:1"].width}
      height={AD_DIMS["1:1"].height}
      defaultProps={{ aspect: "1:1" }}
    />
    <Composition
      id="QueueGuide-16x9"
      component={QueueGuide}
      durationInFrames={GUIDE_DURATION}
      fps={AD_FPS}
      width={AD_DIMS["16:9"].width}
      height={AD_DIMS["16:9"].height}
      defaultProps={{ aspect: "16:9" }}
    />
    <Composition
      id="DuprOfficial-9x16"
      component={DuprOfficial}
      durationInFrames={AD_DURATION}
      fps={AD_FPS}
      width={AD_DIMS["9:16"].width}
      height={AD_DIMS["9:16"].height}
      defaultProps={{ aspect: "9:16" }}
    />
    <Composition
      id="DuprOfficial-1x1"
      component={DuprOfficial}
      durationInFrames={AD_DURATION}
      fps={AD_FPS}
      width={AD_DIMS["1:1"].width}
      height={AD_DIMS["1:1"].height}
      defaultProps={{ aspect: "1:1" }}
    />
    <Composition
      id="DuprOfficial-16x9"
      component={DuprOfficial}
      durationInFrames={AD_DURATION}
      fps={AD_FPS}
      width={AD_DIMS["16:9"].width}
      height={AD_DIMS["16:9"].height}
      defaultProps={{ aspect: "16:9" }}
    />
    <Composition
      id="BigScreen-9x16"
      component={BigScreen}
      durationInFrames={BS_DURATION}
      fps={AD_FPS}
      width={AD_DIMS["9:16"].width}
      height={AD_DIMS["9:16"].height}
      defaultProps={{ aspect: "9:16" }}
    />
    <Composition
      id="BigScreen-1x1"
      component={BigScreen}
      durationInFrames={BS_DURATION}
      fps={AD_FPS}
      width={AD_DIMS["1:1"].width}
      height={AD_DIMS["1:1"].height}
      defaultProps={{ aspect: "1:1" }}
    />
    <Composition
      id="BigScreen-16x9"
      component={BigScreen}
      durationInFrames={BS_DURATION}
      fps={AD_FPS}
      width={AD_DIMS["16:9"].width}
      height={AD_DIMS["16:9"].height}
      defaultProps={{ aspect: "16:9" }}
    />
  </>
);
