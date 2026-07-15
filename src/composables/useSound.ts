import { ref } from 'vue';

export function useSound() {
  let ctx: AudioContext | null = null;
  let masterGain: GainNode | null = null;
  let musicGain: GainNode | null = null;
  let sfxGain: GainNode | null = null;
  let musicTimer: ReturnType<typeof setInterval> | null = null;

  const soundEnabled = ref(
    typeof window !== 'undefined' &&
      localStorage.getItem('dqm_sound') !== 'false',
  );
  const musicEnabled = ref(
    typeof window !== 'undefined' &&
      localStorage.getItem('dqm_music') !== 'false',
  );

  function init() {
    if (ctx) return;
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    ctx = new Ctx();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.9;
    masterGain.connect(ctx.destination);

    sfxGain = ctx.createGain();
    sfxGain.gain.value = 0.9;
    sfxGain.connect(masterGain);

    musicGain = ctx.createGain();
    musicGain.gain.value = 0.5;
    musicGain.connect(masterGain);
  }

  function ensureCtx() {
    init();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume();
    }
  }

  // --- Sound effects ---

  function playTone(
    freq: number,
    duration: number,
    type: OscillatorType = 'sine',
    volume = 0.5,
    slideTo?: number,
  ) {
    if (!soundEnabled.value) return;
    ensureCtx();
    if (!ctx || !sfxGain) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) {
      osc.frequency.exponentialRampToValueAtTime(
        slideTo,
        ctx.currentTime + duration,
      );
    }
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(sfxGain);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  }

  function playNoise(duration: number, volume = 0.3, filterFreq = 1000) {
    if (!soundEnabled.value) return;
    ensureCtx();
    if (!ctx || !sfxGain) return;

    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(sfxGain);
    noise.start();
  }

  // Paddle hit — short pop
  function paddleHit() {
    playTone(220, 0.08, 'square', 0.4, 180);
    playNoise(0.03, 0.15, 2000);
  }

  // Ball bounce on court — soft thud
  function ballBounce() {
    playTone(150, 0.06, 'sine', 0.3, 120);
  }

  // Serve — whoosh + hit
  function serve() {
    playTone(300, 0.15, 'sine', 0.25, 200);
  }

  // Point scored — pleasant chime
  function pointScored() {
    playTone(523, 0.1, 'sine', 0.3);
    setTimeout(() => playTone(659, 0.1, 'sine', 0.3), 80);
    setTimeout(() => playTone(784, 0.15, 'sine', 0.3), 160);
  }

  // Fault — harsh buzzer (player error)
  function fault() {
    playTone(150, 0.3, 'sawtooth', 0.4, 100);
    playNoise(0.15, 0.2, 800);
    setTimeout(() => playTone(120, 0.2, 'sawtooth', 0.3, 80), 100);
  }

  // Net hit — soft tap
  function netHit() {
    playTone(100, 0.05, 'triangle', 0.2);
  }

  // Win — fanfare + crowd clapping
  function win() {
    playTone(523, 0.12, 'sine', 0.35);
    setTimeout(() => playTone(659, 0.12, 'sine', 0.35), 120);
    setTimeout(() => playTone(784, 0.12, 'sine', 0.35), 240);
    setTimeout(() => playTone(1047, 0.25, 'sine', 0.35), 360);
    // Crowd clapping — series of short noise bursts
    for (let i = 0; i < 20; i++) {
      setTimeout(
        () => {
          playNoise(0.04, 0.12, 3000 + Math.random() * 2000);
        },
        400 + i * 80 + Math.random() * 40,
      );
    }
    // Crowd cheer — rising noise swell
    setTimeout(() => {
      if (!soundEnabled.value) return;
      ensureCtx();
      if (!ctx || !sfxGain) return;
      const bufferSize = ctx.sampleRate * 1.5;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * (i / bufferSize) * 0.3;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1500;
      const gain = ctx.createGain();
      gain.gain.value = 0.15;
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(sfxGain);
      noise.start();
    }, 500);
  }

  // Lose — descending tones
  function lose() {
    playTone(400, 0.15, 'sine', 0.3, 350);
    setTimeout(() => playTone(300, 0.15, 'sine', 0.3, 250), 150);
    setTimeout(() => playTone(200, 0.3, 'sine', 0.3, 150), 300);
  }

  // --- Background music ---
  // Simple looping chord progression with melody
  const scale = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25];
  const chords = [
    [261.63, 329.63, 392.0], // C major
    [293.66, 369.99, 440.0], // D minor
    [349.23, 440.0, 523.25], // F major
    [392.0, 493.88, 587.33], // G major
  ];
  let chordIndex = 0;
  let beatIndex = 0;

  function playMusicBeat() {
    if (!musicEnabled.value || !ctx || !musicGain) return;

    const now = ctx.currentTime;
    const chord = chords[chordIndex];

    // Play chord (soft pad)
    if (beatIndex % 8 === 0) {
      chord.forEach((freq) => {
        const osc = ctx!.createOscillator();
        const gain = ctx!.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.08, now + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
        osc.connect(gain);
        gain.connect(musicGain!);
        osc.start(now);
        osc.stop(now + 1.5);
      });
    }

    // Play melody note every 2 beats
    if (beatIndex % 2 === 0) {
      const noteIdx = Math.floor(Math.random() * scale.length);
      const freq = scale[noteIdx] * (Math.random() > 0.5 ? 1 : 2);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.06, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.connect(gain);
      gain.connect(musicGain);
      osc.start(now);
      osc.stop(now + 0.3);
    }

    beatIndex++;
    if (beatIndex % 8 === 0) {
      chordIndex = (chordIndex + 1) % chords.length;
    }
  }

  function startMusic() {
    if (!musicEnabled.value) return;
    ensureCtx();
    if (musicTimer) return;
    musicTimer = setInterval(playMusicBeat, 250);
  }

  function stopMusic() {
    if (musicTimer) {
      clearInterval(musicTimer);
      musicTimer = null;
    }
  }

  function toggleSound() {
    soundEnabled.value = !soundEnabled.value;
    if (typeof window !== 'undefined')
      localStorage.setItem('dqm_sound', String(soundEnabled.value));
  }

  function toggleMusic() {
    musicEnabled.value = !musicEnabled.value;
    if (typeof window !== 'undefined')
      localStorage.setItem('dqm_music', String(musicEnabled.value));
    if (musicEnabled.value) startMusic();
    else stopMusic();
  }

  return {
    soundEnabled,
    musicEnabled,
    paddleHit,
    ballBounce,
    serve,
    pointScored,
    fault,
    netHit,
    win,
    lose,
    startMusic,
    stopMusic,
    toggleSound,
    toggleMusic,
    ensureCtx,
  };
}
