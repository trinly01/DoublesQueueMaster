export const TTS_CONFIG = {
  edgeTts: {
    voice: 'en-PH-RosaNeural',
    rate: '-10%', // 0.8x speed
  },
  speechSynthesis: {
    rate: 0.75, // 0.75x speed (slower for clarity)
    pitch: 1.0,
    volume: 1,
  },
  circuitBreaker: {
    failureThreshold: 2, // trips to OPEN after 2 consecutive failures
    cooldownMs: 10000, // try HALF_OPEN after 10s
  },
  wakeLock: true,
} as const;
