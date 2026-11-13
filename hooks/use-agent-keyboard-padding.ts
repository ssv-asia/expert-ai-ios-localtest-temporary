import { useEffect, useRef } from 'react';
import { Animated, Easing, Keyboard, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Agent screens use the same edge-to-edge IME offset as Simple Chat. Android's
// adjustNothing window mode leaves the composer under the keyboard otherwise.
export function useAgentKeyboardPadding() {
  const insets = useSafeAreaInsets();
  const padding = useRef(new Animated.Value(insets.bottom)).current;

  useEffect(() => {
    // Browser viewports already resize for the on-screen keyboard. Applying the
    // native IME offset there lifts the entire chat a second time.
    if (Platform.OS === 'web') {
      padding.setValue(0);
      return;
    }
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (event) => {
      const height = Platform.OS === 'ios'
        ? event.endCoordinates.height - insets.bottom
        : event.endCoordinates.height + insets.bottom;
      padding.stopAnimation();
      Animated.timing(padding, {
        toValue: Math.max(0, height), duration: 180, easing: Easing.out(Easing.cubic),
        isInteraction: false, useNativeDriver: false,
      }).start();
    });
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => {
      padding.stopAnimation();
      Animated.timing(padding, {
        toValue: insets.bottom, duration: 160, easing: Easing.out(Easing.cubic),
        isInteraction: false, useNativeDriver: false,
      }).start();
    });
    return () => { show.remove(); hide.remove(); };
  }, [insets.bottom, padding]);

  return padding;
}
