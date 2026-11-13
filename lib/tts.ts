// On-device text-to-speech (read-aloud) — expo-speech, zero cost, no server
// involvement, uses whatever voices are already installed on the device.
import * as Speech from 'expo-speech';
import { getTtsPrefs } from './voice-prefs';

// Android's TTS bridge rejects input at roughly 4,000 characters. Leave a
// safety margin because the platform limit can vary slightly by engine.
const MAX_TTS_CHUNK_LENGTH = 3800;

function splitForSpeech(text: string): string[] {
  const chunks: string[] = [];
  let remaining = text.trim();

  while (remaining.length > MAX_TTS_CHUNK_LENGTH) {
    const window = remaining.slice(0, MAX_TTS_CHUNK_LENGTH);
    const boundary = Math.max(
      window.lastIndexOf('. '),
      window.lastIndexOf('! '),
      window.lastIndexOf('? '),
      window.lastIndexOf('\n'),
      window.lastIndexOf(' '),
    );
    const cutAt = boundary > 0 ? boundary + 1 : MAX_TTS_CHUNK_LENGTH;
    chunks.push(remaining.slice(0, cutAt).trim());
    remaining = remaining.slice(cutAt).trimStart();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

export async function getAvailableVoices(): Promise<Speech.Voice[]> {
  try {
    return await Speech.getAvailableVoicesAsync();
  } catch {
    return [];
  }
}

export async function speakText(text: string, onDone?: () => void, onError?: () => void): Promise<void> {
  const prefs = await getTtsPrefs();
  const chunks = splitForSpeech(text);
  if (chunks.length === 0) {
    onDone?.();
    return;
  }

  try {
    let index = 0;
    const speakNext = () => {
      if (index >= chunks.length) {
        onDone?.();
        return;
      }

      const chunk = chunks[index++];
      Speech.speak(chunk, {
        voice: prefs.voiceId ?? undefined,
        rate: prefs.rate,
        onDone: speakNext,
        onError: () => {
          index = chunks.length;
          onError?.();
        },
        onStopped: () => {
          index = chunks.length;
          onDone?.();
        },
      });
    };

    speakNext();
  } catch {
    onError?.();
  }
}

export function stopSpeaking(): void {
  try {
    Speech.stop();
  } catch {
    /* best-effort */
  }
}

export async function isSpeaking(): Promise<boolean> {
  try {
    return await Speech.isSpeakingAsync();
  } catch {
    return false;
  }
}
