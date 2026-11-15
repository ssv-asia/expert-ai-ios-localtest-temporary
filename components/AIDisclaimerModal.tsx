import React from 'react';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Linking from 'expo-linking';
import { Colors, Fonts } from '@/constants/theme';

interface AIDisclaimerModalProps {
  visible: boolean;
  onDismiss: () => void;
  isDark: boolean;
}

export function AIDisclaimerModal({
  visible,
  onDismiss,
  isDark,
}: AIDisclaimerModalProps) {
  const colors = Colors[isDark ? 'dark' : 'light'];
  const textPrimary = isDark ? '#fefdfd' : colors.text;
  const textMuted = isDark ? '#cdc8c5' : colors.textTertiary;
  const bg = isDark ? '#1a1a1a' : '#FFFFFF';
  const overlayBg = isDark ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.5)';

  const handleOpenPrivacyPolicy = async () => {
    try {
      await Linking.openURL('https://ssv.asia/privacy-policy/');
    } catch {
      Alert.alert('Error', 'Could not open privacy policy link');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={Platform.OS === 'ios' ? () => {} : onDismiss}>
      <View style={[styles.overlay, { backgroundColor: overlayBg }]}>
        <View style={[styles.card, { backgroundColor: bg }]}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.emoji]}>🤖</Text>
            <Text style={[styles.title, { color: textPrimary }]}>
              About Expert AI
            </Text>
          </View>

          {/* Content */}
          <ScrollView style={styles.contentScroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {/* Apple requires explicit consent before user data is shared with
                third-party AI services. Keep this disclosure on the first-run
                acknowledgement, before the user starts sending prompts. */}
            {Platform.OS === 'ios' ? (
              <View style={[styles.section, styles.dataNotice, { borderColor: isDark ? '#51421f' : '#ead9ad', backgroundColor: isDark ? '#292315' : '#fff9e9' }]}>
                <Text style={[styles.sectionTitle, { color: textPrimary }]}>Your content and AI providers</Text>
                <Text style={[styles.body, { color: textMuted }]}>
                  When you send a message, Expert AI sends your prompt and the conversation context or files you choose to include to its gateway and the providers needed to answer. This can include OpenRouter and the selected AI model provider, Tavily for requested web searches, and Supabase for knowledge retrieval. Those providers process your content under their own terms and retention policies. Do not send content you are not comfortable sharing. Read the Privacy Policy for details.
                </Text>
              </View>
            ) : null}

            {/* Section 1: AI-Generated Responses */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: textPrimary }]}>
                AI-Generated Responses
              </Text>
              <Text style={[styles.body, { color: textMuted }]}>
                This app uses artificial intelligence to generate responses.
                Responses may be inaccurate or outdated.{'\n\n'}
                <Text style={{ fontFamily: Fonts.sansSemiBold }}>
                  Not professional advice.
                </Text>
              </Text>
            </View>

            {/* Section 2: Model Information */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: textPrimary }]}>
                Model
              </Text>
              <Text style={[styles.body, { color: textMuted }]}>
                OpenRouter{'\n'}
                (routing to various AI providers)
              </Text>
            </View>

            {/* Section 3: Disclaimer */}
            <View style={[styles.disclaimer, { borderColor: isDark ? '#2a2a2a' : '#f0f0f0' }]}>
              <Text style={[styles.disclaimerText, { color: textMuted }]}>
                ⓘ AI may make errors. Do not rely on this app for medical, legal,
                or financial decisions.
              </Text>
            </View>
          </ScrollView>

          {/* Buttons */}
          <View style={styles.buttons}>
            <Pressable
              style={[styles.button, styles.primaryButton, { backgroundColor: '#D71921' }]}
              onPress={onDismiss}
            >
              <Text style={[styles.buttonText, { color: '#FFFFFF' }]}>
                {Platform.OS === 'ios' ? 'Agree and continue' : 'Got It'}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.button, styles.secondaryButton, { borderColor: textMuted }]}
              onPress={handleOpenPrivacyPolicy}
            >
              <Text style={[styles.buttonText, { color: textPrimary }]}>
                Privacy Policy
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  card: {
    borderRadius: 12,
    padding: 24,
    maxWidth: 400,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  emoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  title: {
    fontSize: 20,
    fontFamily: Fonts.sansBold,
  },
  content: {
    marginBottom: 24,
    gap: 16,
  },
  contentScroll: {
    maxHeight: '72%',
  },
  dataNotice: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontFamily: Fonts.sansSemiBold,
  },
  body: {
    fontSize: 13,
    fontFamily: Fonts.sans,
    lineHeight: 18,
  },
  disclaimer: {
    borderLeftWidth: 3,
    paddingLeft: 12,
    paddingVertical: 8,
  },
  disclaimerText: {
    fontSize: 12,
    fontFamily: Fonts.sans,
    lineHeight: 16,
  },
  buttons: {
    gap: 12,
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: '#D71921',
  },
  secondaryButton: {
    borderWidth: 1,
  },
  buttonText: {
    fontSize: 14,
    fontFamily: Fonts.sansSemiBold,
  },
});
