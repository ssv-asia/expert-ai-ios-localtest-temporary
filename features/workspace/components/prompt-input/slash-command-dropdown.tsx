import { useRef, useEffect } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { Fonts } from '@/constants/theme';
import { SlashCommand } from './constants';
import { usePromptTheme } from './use-theme-colors';

interface SlashCommandDropdownProps {
  commands: SlashCommand[];
  selectedIndex: number;
  dropdownAnim: Animated.Value;
  overlay?: boolean;
  onSelect: (command: SlashCommand) => void;
}

export function SlashCommandDropdown({
  commands,
  selectedIndex,
  dropdownAnim,
  overlay = false,
  onSelect,
}: SlashCommandDropdownProps) {
  const theme = usePromptTheme();
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: selectedIndex * 36, animated: true });
  }, [selectedIndex]);

  return (
    <Animated.View
      style={[
        styles.container,
        overlay ? styles.overlayContainer : styles.stackedContainer,
        {
          backgroundColor: theme.dropdownBg,
          borderColor: theme.dropdownBorder,
          opacity: dropdownAnim,
          transform: [
            {
              translateY: dropdownAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [8, 0],
              }),
            },
          ],
          ...(overlay
            ? {
                boxShadow: '0px 10px 30px rgba(0, 0, 0, 0.14)',
              }
            : {}),
        },
      ]}
    >
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {commands.map((cmd, index) => (
          <Pressable
            key={cmd.name}
            onPress={() => onSelect(cmd)}
            accessibilityRole="menuitem"
            accessibilityLabel={`/${cmd.name} — ${cmd.description}`}
            accessibilityState={{ selected: index === selectedIndex }}
            style={({ pressed, hovered }: any) => [
              styles.item,
              index === selectedIndex && { backgroundColor: theme.selectedBg },
              (pressed || hovered) &&
                index !== selectedIndex && { backgroundColor: theme.hoverBg },
            ]}
          >
            <Text style={[styles.name, { color: theme.textPrimary }]}>
              /{cmd.name}
            </Text>
            <Text
              style={[styles.desc, { color: theme.textMuted }]}
              numberOfLines={1}
            >
              {cmd.description}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 0.633,
    overflow: 'hidden',
  },
  stackedContainer: {
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderBottomWidth: 0,
    zIndex: 2,
  },
  overlayContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: '100%',
    marginBottom: 8,
    borderRadius: 12,
    zIndex: 20,
    elevation: 12,
  },
  scroll: {
    maxHeight: 260,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 36,
    gap: 12,
  },
  name: {
    fontSize: 13,
    fontFamily: Fonts.sansMedium,
    minWidth: 80,
  },
  desc: {
    fontSize: 13,
    fontFamily: Fonts.sans,
    flex: 1,
  },
});
