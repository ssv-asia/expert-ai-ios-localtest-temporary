import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Colors, Fonts } from "@/constants/theme";
import type { ChatMessage } from "../../types";
import { usePathname } from 'expo-router';
import { useThemeStore } from '@/lib/theme-store';
import { agentThemeColors } from '@/features/agent/agent-colors';

interface UserMessageProps {
  message: ChatMessage;
  isDark: boolean;
}

export const UserMessage = memo(function UserMessage({
  message,
  isDark,
}: UserMessageProps) {
  const pathname = usePathname();
  useThemeStore((s) => s.settings);
  const pairedChat = pathname.startsWith('/agent-chat');
  const themeState = useThemeStore.getState();
  const agentColors = agentThemeColors(themeState.getColors(), themeState.settings.preset);
  const colors = pairedChat
    ? { ...Colors[isDark ? 'dark' : 'light'], ...agentColors }
    : isDark ? Colors.dark : Colors.light;

  return (
    <View style={styles.container}>
      <View style={[styles.bubble, { backgroundColor: pairedChat ? agentColors.userBubble : colors.surfaceRaised }]}>
        <Text style={[styles.text, { color: pairedChat ? agentColors.userBubbleText : colors.text }]} selectable>
          {message.text}
        </Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    alignItems: "flex-end",
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  bubble: {
    borderRadius: 16,
    borderBottomRightRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: "85%",
  },
  text: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: Fonts.sans,
  },
});
