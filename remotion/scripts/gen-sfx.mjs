/**
 * Procedurally synthesizes the ad sound cues as 16-bit mono WAV files into
 * public/sfx/. Zero dependencies — run once: `npm run gen:sfx`.
 * Regenerate after tweaking the synth functions below.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RATE = 44100;
const OUT = join(dirname(fileURLToPath(import.meta.url)), "../public/sfx");

const wav = (samples) => {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) =>
    data.writeInt16LE(Math.max(-1, Math.min(1, s)) * 32767, i * 2),
  );
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
};

const t = (i) => i / RATE;
const env = (x, attack, decay) =>
  x < attack ? x / attack : Math.exp(-(x - attack) * decay);
const noise = () => Math.random() * 2 - 1;
const gen = (secs, fn) =>
  Array.from({ length: Math.round(secs * RATE) }, (_, i) => fn(t(i), i));

const sfx = {
  // paddle pop — bright noise burst + body tone
  dink: gen(
    0.14,
    (x) =>
      (Math.sin(2 * Math.PI * 950 * x) * 0.5 + noise() * 0.35) *
      env(x, 0.004, 55),
  ),
  // whoosh — noise sweep for transitions
  whoosh: gen(0.4, (x) => {
    const sweep = Math.sin(2 * Math.PI * (200 + x * 2600) * x);
    return noise() * 0.5 * sweep * env(x, 0.08, 6);
  }),
  // ui click
  click: gen(
    0.07,
    (x) => Math.sin(2 * Math.PI * 1800 * x) * env(x, 0.002, 90) * 0.6,
  ),
  // badge/link chime — two-tone up
  chime: gen(0.45, (x) => {
    const f = x < 0.12 ? 880 : 1318.5;
    return Math.sin(2 * Math.PI * f * x) * env(x, 0.01, 7) * 0.6;
  }),
  // rating tick
  tick: gen(
    0.05,
    (x) => Math.sin(2 * Math.PI * 1560 * x) * env(x, 0.002, 110) * 0.5,
  ),
  // little win motif — C E G
  win: gen(0.7, (x) => {
    const seq = x < 0.15 ? 523.25 : x < 0.32 ? 659.25 : 783.99;
    return Math.sin(2 * Math.PI * seq * x) * env(x, 0.01, 4.5) * 0.55;
  }),
};

mkdirSync(OUT, { recursive: true });
for (const [name, samples] of Object.entries(sfx)) {
  writeFileSync(join(OUT, `${name}.wav`), wav(samples));
  console.log(`wrote sfx/${name}.wav (${samples.length} samples)`);
}

// ---------------------------------------------------------------------------
// Music bed — playful minimal loop: marimba-ish plucks (I–V–vi–IV), soft
// kick + offbeat hats, ~104 BPM. Designed to sit under VO at ~0.12–0.15 vol.
// ---------------------------------------------------------------------------
const BPM = 104;
const SPB = 60 / BPM; // seconds per beat
const EIGHTH = SPB / 2;

// note helpers (C4 = 261.63)
const note = (semitonesFromC4) => 261.63 * Math.pow(2, semitonesFromC4 / 12);

// I–V–vi–IV in C: C-E-G, G-B-D, A-C-E, F-A-C
const CHORDS = [
  [0, 4, 7],
  [7, 11, 14],
  [9, 12, 16],
  [5, 9, 12],
];
const BASS = [-12, -5, -3, -7]; // C3 G3 A3 F3

const pluck = (f, x) =>
  (Math.sin(2 * Math.PI * f * x) * 0.7 +
    Math.sin(2 * Math.PI * f * 2 * x) * 0.25 +
    Math.sin(2 * Math.PI * f * 3 * x) * 0.08) *
  env(x, 0.005, 9);

const kick = (x) => {
  const f = 55 + 60 * Math.exp(-x * 40);
  return Math.sin(2 * Math.PI * f * x) * env(x, 0.002, 18) * 0.9;
};
const hat = (x) => noise() * env(x, 0.001, 60) * 0.18;

const DUR = 15.2;
const music = Array.from({ length: Math.round(DUR * RATE) }, (_, i) => {
  const x = t(i);
  const beat = Math.floor(x / SPB);
  const eighth = Math.floor(x / EIGHTH);
  const bar = Math.floor(beat / 4);
  const chord = CHORDS[bar % 4];

  let s = 0;
  // kick on beats 1 & 3
  const kickX = x - beat * SPB;
  if (beat % 2 === 0 && kickX < 0.25) s += kick(kickX);
  // hats on off-8ths
  const hatX = x - eighth * EIGHTH;
  if (eighth % 2 === 1 && hatX < 0.06) s += hat(hatX);
  // plucks: chord arpeggio on 8ths, rotate root→3rd→5th→octave
  const arpNote =
    chord[eighth % 3] +
    12 * Math.floor((eighth % 8) / 4) * 0 +
    (eighth % 8 === 6 ? 12 : 0);
  const pluckX = x - eighth * EIGHTH;
  if (pluckX < 0.45) s += pluck(note(arpNote), pluckX) * 0.5;
  // bass root on beat 1
  const bassX = x - Math.floor(x / (SPB * 4)) * (SPB * 4);
  if (bassX < 0.9) s += pluck(note(BASS[bar % 4]), bassX) * 0.55;

  // gentle loop fade at tail
  return s * Math.min(1, (DUR - x) / 1.2);
});

const MUSIC_OUT = join(OUT, "../music");
mkdirSync(MUSIC_OUT, { recursive: true });
writeFileSync(join(MUSIC_OUT, "bed.wav"), wav(music));
console.log(`wrote music/bed.wav (${music.length} samples)`);
