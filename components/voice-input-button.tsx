// Voice-to-text compose input — NOT a real-time conversational voice mode
// (that needs paid streaming STT+TTS infra this app doesn't have). This is
// Android's own on-device SpeechRecognizer: tap, speak, the words land in the
// text box exactly like typing. Zero cost, zero server involvement, works
// offline on most devices once the on-device model is present.
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, Text, View, type LayoutChangeEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import { getSttLanguage } from '@/lib/voice-prefs';
import { Fonts } from '@/constants/theme';

/** A single bar of the recording waveform, looping a height pulse on a phase offset. */
function WaveBar({ delay, color }: { delay: number; color: string }) {
  const scale = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1, duration: 350, delay, easing: Easing.ease, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 0.3, duration: 350, easing: Easing.ease, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [scale, delay]);

  return (
    <Animated.View
      style={{
        width: 3,
        height: 16,
        borderRadius: 2,
        backgroundColor: color,
        transform: [{ scaleY: scale }],
      }}
    />
  );
}

/** Recording indicator shown while the mic is actively listening — a small pill
 * with pulsing waveform bars so it's unmistakable that speech is being captured. */
export function VoiceRecordingIndicator({ color }: { color: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 14,
        backgroundColor: 'rgba(255,59,48,0.12)',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, height: 16 }}>
        {[0, 120, 240, 360].map((delay) => (
          <WaveBar key={delay} delay={delay} color="#FF3B30" />
        ))}
      </View>
      <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 12, color: '#FF3B30' }}>Listening…</Text>
    </View>
  );
}

export function VoiceInputButton({
  color,
  disabled,
  onTranscript,
  onStart,
  onError,
  onListeningChange,
  onLayout,
}: {
  color: string;
  disabled?: boolean;
  /** Called with the live/final transcript as speech is recognized. */
  onTranscript: (text: string) => void;
  /** Called the moment listening actually begins — lets the caller snapshot
   *  whatever text was already typed, so voice input appends rather than
   *  clobbering it. */
  onStart?: () => void;
  onError?: (message: string) => void;
  /** Called whenever the listening state flips, so the caller can render a
   *  recording indicator (e.g. VoiceRecordingIndicator) elsewhere in the UI. */
  onListeningChange?: (listening: boolean) => void;
  onLayout?: (event: LayoutChangeEvent) => void;
}) {
  const [listening, setListening] = useState(false);
  const [starting, setStarting] = useState(false);
  // The unmount cleanup below needs the LIVE value, not whatever `listening`
  // was on the render that registered the effect — a plain closure over
  // `listening` in a `useEffect(..., [])` only ever sees its initial value
  // (false), so the "stop the mic on unmount" guard could never actually
  // fire. Mirrored into a ref on every change so the cleanup reads current state.
  const listeningRef = useRef(false);

  useSpeechRecognitionEvent('start', () => { listeningRef.current = true; setListening(true); setStarting(false); onStart?.(); onListeningChange?.(true); });
  useSpeechRecognitionEvent('end', () => { listeningRef.current = false; setListening(false); onListeningChange?.(false); });
  useSpeechRecognitionEvent('result', (event) => {
    const transcript = event.results[0]?.transcript;
    if (transcript) onTranscript(transcript);
  });
  useSpeechRecognitionEvent('error', (event) => {
    listeningRef.current = false;
    setListening(false);
    setStarting(false);
    onListeningChange?.(false);
    // "no-speech" / "aborted" are just "nothing was said" / "user stopped it" —
    // not real errors worth surfacing.
    if (event.error !== 'no-speech' && event.error !== 'aborted') {
      onError?.(event.message || 'Voice input failed. Please try again.');
    }
  });

  // Stop listening if this button unmounts (e.g. the user navigates away)
  // while still recording — never leave the mic open in the background.
  useEffect(() => {
    return () => {
      if (listeningRef.current) ExpoSpeechRecognitionModule.stop();
    };
  }, []);

  const handlePress = async () => {
    if (listening) {
      ExpoSpeechRecognitionModule.stop();
      return;
    }
    setStarting(true);
    try {
      const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!result.granted) {
        setStarting(false);
        onError?.('Microphone/speech permission denied.');
        return;
      }
      // null (system default) omits `lang` entirely so the recognizer falls
      // back to the device's own input-language setting, rather than forcing
      // English — that's the multilingual-by-default behavior; the Settings
      // "Voice input language" picker lets a user pin a specific one instead.
      const lang = await getSttLanguage();
      ExpoSpeechRecognitionModule.start({
        ...(lang ? { lang } : {}),
        interimResults: true,
        continuous: false,
      });
    } catch {
      setStarting(false);
      onError?.('Voice input is not available on this device.');
    }
  };

  return (
    <Pressable
      onLayout={onLayout}
      onPress={handlePress}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={listening ? 'Stop voice input' : 'Voice input'}
      style={{ opacity: disabled ? 0.4 : 1, height: 40, width: 40, alignItems: 'center', justifyContent: 'center' }}
    >
      {starting ? (
        <ActivityIndicator size="small" color={color} />
      ) : (
        <Ionicons name={listening ? 'mic' : 'mic-outline'} size={22} color={listening ? '#FF3B30' : color} />
      )}
    </Pressable>
  );
}
