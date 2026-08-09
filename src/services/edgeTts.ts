// @ts-expect-error - no type declarations shipped with the package
import EdgeTTSBrowser from '@kingdanx/edge-tts-browser';
import { TTS_CONFIG } from './ttsConfig';

let ttsInstance: EdgeTTSBrowser | null = null;

const getTts = (): EdgeTTSBrowser => {
  if (!ttsInstance) ttsInstance = new EdgeTTSBrowser();
  return ttsInstance;
};

export const isEdgeTtsAvailable = (): boolean => {
  return typeof navigator !== 'undefined' && navigator.onLine;
};

export const resetEdgeTtsInstance = () => {
  ttsInstance = null;
};

export const edgeTtsSpeak = async (
  text: string,
): Promise<{
  audio: HTMLAudioElement;
  cleanup: () => void;
}> => {
  const tts = getTts();
  // Reset accumulated audio buffer (library doesn't do this between calls)
  tts.file = new Uint8Array();
  tts.tts.setVoiceParams({
    text,
    voice: TTS_CONFIG.edgeTts.voice,
    rate: TTS_CONFIG.edgeTts.rate,
  });
  const blob = await tts.ttsToFile(`tts-${Date.now()}.mp3`);
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  const cleanup = () => URL.revokeObjectURL(url);
  await audio.play();
  return { audio, cleanup };
};
