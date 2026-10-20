import {
  Audio,
  Sequence,
  staticFile,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

/**
 * Music bed — playful minimal loop under everything. Fades in over ~0.4s,
 * ducks to ~13% under the mix, fades out over the last 1.5s.
 * Drop a licensed track at public/music/bed.mp3 to replace the procedural one.
 */
export const MusicBed: React.FC<{ file?: string }> = ({
  file = "music/bed.wav",
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const fadeIn = interpolate(frame, [0, 0.4 * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(
    frame,
    [durationInFrames - 1.5 * fps, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  return (
    <Audio
      src={staticFile(file)}
      volume={0.13 * fadeIn * fadeOut}
      durationInFrames={durationInFrames}
    />
  );
};

export interface VoLine {
  /** Absolute frame the line starts at — match the scene's Sequence start. */
  at: number;
  file: string;
  volume?: number;
}

/** Scene-synced voiceover — one scheduled cue per line (like Sfx, but VO). */
export const VoCue: React.FC<VoLine> = ({ at, file, volume = 1 }) => (
  <Sequence from={at} premountFor={0}>
    <Audio src={staticFile(`vo/${file}.mp3`)} volume={volume} />
  </Sequence>
);

/**
 * Ad voiceover bed — renders each line at its scene frame.
 * `lines` is required; pass the ad's VO_LINES constant.
 */
export const AdAudio: React.FC<{
  lines: VoLine[];
  /** Legacy single-track file under public/vo/ — overrides lines if set. */
  voiceoverFile?: string;
  /** Music bed file under public/ — defaults to the procedural loop. */
  musicFile?: string;
}> = ({ lines, voiceoverFile, musicFile }) => (
  <>
    <MusicBed file={musicFile} />
    {voiceoverFile ? (
      <Audio src={staticFile(voiceoverFile)} volume={1} />
    ) : (
      lines.map((l) => <VoCue key={`${l.at}-${l.file}`} {...l} />)
    )}
  </>
);

/** Fire-and-forget procedural SFX cue from public/sfx/<file>.wav. */
export const Sfx: React.FC<{
  at: number;
  file: "dink" | "whoosh" | "click" | "chime" | "tick" | "win";
  volume?: number;
}> = ({ at, file, volume = 0.8 }) => (
  <Sequence from={at} durationInFrames={45} premountFor={0}>
    <Audio src={staticFile(`sfx/${file}.wav`)} volume={volume} />
  </Sequence>
);
