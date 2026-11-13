import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';

import { Colors, Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { AECKnowledgeService, type AECKnowledgeState } from '@/lib/aec-knowledge-service';
import { getSession, type Session } from '@/lib/auth';

interface AECKnowledgeSectionProps {
  session: Session | null;
}

export const AECKnowledgeSection: React.FC<AECKnowledgeSectionProps> = ({ session }) => {
  const isDark = useColorScheme() === 'dark';
  const colors = isDark ? Colors.dark : Colors.light;
  const [state, setState] = useState<AECKnowledgeState>({ enabled: false, activated: false });
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Load state on mount
  useEffect(() => {
    const load = async () => {
      try {
        const initial = await AECKnowledgeService.init();
        setState(initial);
        const isEnabled = await AECKnowledgeService.isEnabled();
        setEnabled(isEnabled);
      } catch {
        setState({ enabled: false, activated: false });
      }
      setLoading(false);
    };
    load();
  }, []);

  const checkStatus = React.useCallback(async () => {
    if (!session || !session.email) return;
    try {
      const freshState = await AECKnowledgeService.checkStatus(session.token);
      setState(freshState);

      // Also refresh balance from MCP if link exists
      if (freshState.link && freshState.activated) {
        try {
          const balance = await AECKnowledgeService.queryMCPBalance(freshState.link);
          if (balance.freeLeft !== undefined || balance.credits !== undefined) {
            setState((prev) => ({
              ...prev,
              freeLeft: balance.freeLeft ?? prev.freeLeft,
              credits: balance.credits ?? prev.credits,
            }));
          }
        } catch (err) {
          console.warn('[AECKnowledge] Failed to refresh balance:', err);
        }
      }
    } catch (err) {
      console.warn('[AECKnowledge] Failed to check status:', err);
    }
  }, [session]);

  // Check status when session changes, and refresh balance periodically
  useEffect(() => {
    if (!session || !session.email) return;
    checkStatus();
    // Refresh balance every 10 seconds to catch quota changes from MCP queries
    const interval = setInterval(checkStatus, 10000);
    return () => clearInterval(interval);
  }, [session, checkStatus]);

  const handleManualRefresh = async () => {
    setRefreshing(true);
    await checkStatus();
    setRefreshing(false);
  };

  const handleEnable = async () => {
    if (!session) return;
    setActivating(true);
    try {
      const newState = await AECKnowledgeService.activate(session.token);
      setState(newState);
      setEnabled(true);
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Failed to enable',
      }));
    } finally {
      setActivating(false);
    }
  };

  const handleToggleEnabled = async (value: boolean) => {
    setEnabled(value);
    if (value) {
      await AECKnowledgeService.enable();
    } else {
      await AECKnowledgeService.disable();
    }
  };


  if (!session) {
    return (
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          📚 Architecture & Construction Wikipedia
        </Text>
        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          Sign in to access instant answers about building codes, construction standards, and
          engineering practices.
        </Text>
      </View>
    );
  }

  return (
    <>
      <View style={styles.section}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            📚 Architecture & Construction Wikipedia
          </Text>
          {state.activated && (
            <Pressable onPress={handleManualRefresh} disabled={refreshing} hitSlop={8}>
              {refreshing ? (
                <ActivityIndicator size="small" color={colors.textSecondary} />
              ) : (
                <Ionicons name="refresh" size={18} color={colors.textSecondary} />
              )}
            </Pressable>
          )}
        </View>

        {loading ? (
          <ActivityIndicator size="small" color={colors.text} />
        ) : state.activated ? (
          <>
            {/* Connected state — label reflects the actual on/off toggle, not just
                whether this account has ever been provisioned a link. */}
            <View
              style={[styles.settingRow, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.settingLabel, { color: colors.text, marginBottom: 4 }]}>
                  {enabled ? 'Connected ✓' : 'Off'}
                </Text>
                <Text style={[styles.hint, { color: colors.textSecondary, marginTop: 0 }]}>
                  {enabled
                    ? 'Your private knowledge link is active'
                    : 'Turn on to let the assistant search building codes & standards'}
                </Text>
              </View>
              <Switch
                value={enabled}
                onValueChange={handleToggleEnabled}
                trackColor={{ false: colors.border, true: '#34C759' }}
                thumbColor={enabled ? '#fff' : '#999'}
              />
            </View>

            {/* Balance display */}
            <View style={{ marginTop: 12, flexDirection: 'row', gap: 12 }}>
              <View
                style={[
                  styles.balanceCard,
                  { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
                ]}
              >
                <Text style={[styles.balanceNumber, { color: colors.text }]}>
                  {state.freeLeft ?? '—'}
                </Text>
                <Text style={[styles.balanceLabel, { color: colors.textSecondary }]}>
                  Free queries left today (of 10)
                </Text>
              </View>
              <View
                style={[
                  styles.balanceCard,
                  { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
                ]}
              >
                <Text style={[styles.balanceNumber, { color: colors.text }]}>
                  {state.credits ?? '—'}
                </Text>
                <Text style={[styles.balanceLabel, { color: colors.textSecondary }]}>
                  Prepaid queries
                </Text>
              </View>
            </View>

            <Text style={[styles.hint, { color: colors.textSecondary, marginTop: 12 }]}>
              Use keyword "aec" in your message to search the architecture & construction Wikipedia.
              Free queries: 10 daily. Premium queries coming in v1.1.
            </Text>

            {state.error && (
              <Text style={[styles.hint, { color: '#FF3B30', marginTop: 8 }]}>{state.error}</Text>
            )}
          </>
        ) : (
          <>
            {/* Not connected state */}
            <Text style={[styles.hint, { color: colors.textSecondary, marginBottom: 12 }]}>
              Access instant answers about building codes, construction standards, engineering practices,
              and architectural guidelines. Powered by thousands of technical documents and regulations.
            </Text>

            <Pressable
              onPress={handleEnable}
              disabled={activating}
              style={[
                styles.enableButton,
                {
                  backgroundColor: '#007AFF',
                  opacity: activating ? 0.6 : 1,
                },
              ]}
            >
              {activating ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                  <Text style={[styles.enableButtonText]}>Enable Free Access</Text>
                </>
              )}
            </Pressable>

            <Text style={[styles.hint, { color: colors.textSecondary, marginTop: 12 }]}>
              10 free searches daily. Upgrade anytime with prepaid credits.
            </Text>

            {state.error && (
              <Text style={[styles.hint, { color: '#FF3B30', marginTop: 8 }]}>{state.error}</Text>
            )}
          </>
        )}
      </View>

    </>
  );
};

const styles = StyleSheet.create({
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 14,
    marginBottom: 12,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 8,
    borderWidth: 1,
    gap: 12,
  },
  settingLabel: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 14,
  },
  balanceCard: {
    flex: 1,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  balanceNumber: {
    fontFamily: Fonts.sansBold,
    fontSize: 20,
    marginBottom: 4,
  },
  balanceLabel: {
    fontFamily: Fonts.sans,
    fontSize: 11,
    textAlign: 'center',
  },
  enableButton: {
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  enableButtonText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 14,
    color: '#fff',
  },
  hint: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    marginTop: 8,
  },
});
