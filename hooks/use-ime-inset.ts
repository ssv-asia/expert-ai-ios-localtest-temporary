import { useEffect, useState } from 'react';
import { DeviceEventEmitter, Keyboard, NativeModules, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const EVENT = 'ExpertAIImeInsetsChanged';
const nativeImeInsets = NativeModules.ExpertAIImeInsets as
  | { start?: () => void; stop?: () => void }
  | undefined;

/**
 * Returns Android's measured IME bottom inset. The Keyboard event fallback is
 * retained for Expo/web builds and for devices where the native bridge is not
 * present yet (for example, an OTA JS update running in an older binary).
 */
export function useImeInset(): number {
  const [inset, setInset] = useState(0);
  const safeArea = useSafeAreaInsets();

  useEffect(() => {
    const isAndroid = Platform.OS === 'android';
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const updateFromKeyboard = (event?: { endCoordinates?: { height?: number } }) => {
      const reported = event?.endCoordinates?.height ?? Keyboard.metrics()?.height ?? 0;
      // Some edge-to-edge Android keyboards omit the measured gesture/nav inset;
      // iOS already includes the home-indicator area in its reported height.
      const height = Platform.OS === 'android'
        ? reported + safeArea.bottom
        : Math.max(0, reported - safeArea.bottom);
      setInset(Math.max(0, height));
    };
    // Keep the event fallback active even when the native bridge exists. On some
    // Android versions insets reach the decor view but not the React content view.
    const show = Keyboard.addListener(showEvent, updateFromKeyboard);
    const hide = Keyboard.addListener(hideEvent, () => setInset(0));
    const native = isAndroid
      ? DeviceEventEmitter.addListener(EVENT, (event?: { bottom?: number; visible?: boolean }) => {
          // Never let a shorter native value replace the keyboard event's
          // measured value. This matters when edge-to-edge omits the gesture
          // inset from one of the two reporting paths.
          if (event?.visible && (event.bottom ?? 0) > 0) {
            setInset((currentInset) => Math.max(currentInset, event.bottom ?? 0));
          }
        })
      : null;

    if (isAndroid) nativeImeInsets?.start?.();
    const current = Keyboard.metrics();
    if (current) updateFromKeyboard({ endCoordinates: current });

    return () => {
      show?.remove();
      hide?.remove();
      native?.remove();
      if (isAndroid) nativeImeInsets?.stop?.();
    };
  }, [safeArea.bottom]);

  return inset;
}
