import { useRef, useEffect, type ReactNode } from "react";
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

export function BottomSheet({ visible, onClose, title, children }: BottomSheetProps) {
  const colorScheme = useColorScheme() ?? "light";
  const isDark = colorScheme === "dark";
  const slideAnim = useRef(new Animated.Value(400)).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(overlayAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, tension: 120, friction: 14, useNativeDriver: true }),
      ]).start();
    }
  }, [overlayAnim, slideAnim, visible]);

  const animateClose = () => {
    Animated.parallel([
      Animated.timing(overlayAnim, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 400, duration: 180, useNativeDriver: true }),
    ]).start(() => onClose());
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={animateClose}>
      <View style={styles.root}>
        <Animated.View style={[styles.overlay, { opacity: overlayAnim }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={animateClose} />
        </Animated.View>
        <Animated.View
          style={[
            styles.container,
            {
              backgroundColor: isDark ? "#1e1e1e" : "#FFFFFF",
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <View style={styles.handle}>
            <View style={[styles.handleBar, { backgroundColor: isDark ? "#555" : "#CCC" }]} />
          </View>
          {title && (
            <Text style={[styles.title, { color: isDark ? "#fefdfd" : "#1A1A1A" }]}>{title}</Text>
          )}
          <ScrollView
            style={styles.scroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  container: {
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    paddingBottom: 34,
    maxHeight: "70%",
  },
  handle: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 6,
  },
  handleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  title: {
    fontSize: 15,
    fontFamily: Fonts.sansSemiBold,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  scroll: {
    maxHeight: 400,
    paddingHorizontal: 16,
  },
});
