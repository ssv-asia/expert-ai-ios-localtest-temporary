import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Sentry from '@sentry/react-native';
import { recordCrash } from '@/lib/crash-log';

interface Props {
  children: React.ReactNode;
  /** Optional label so logs/telemetry can tell which boundary caught it. */
  scope?: string;
}
interface State {
  error: Error | null;
}

/**
 * Catches render/lifecycle exceptions anywhere below it and shows a recoverable
 * screen instead of a white screen of death. Without this, one bad render (a
 * malformed markdown token, an unexpected API shape, a null deref in a child)
 * takes the whole app down with no way back.
 *
 * Also exported from app/_layout.tsx as `ErrorBoundary` so expo-router uses it
 * as the root route boundary.
 */
export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Visible in `adb logcat` / Metro …
    console.error(
      `[ErrorBoundary${this.props.scope ? ':' + this.props.scope : ''}]`,
      error?.message,
      info?.componentStack,
    );
    // … and persisted on-device for the founder Console (best-effort, never throws).
    recordCrash(error, 'render', info?.componentStack ?? undefined);
    // … and to Sentry (no-op in dev / before the native build).
    try {
      Sentry.captureException(error, { extra: { scope: this.props.scope, componentStack: info?.componentStack } });
    } catch {
      /* never let reporting throw */
    }
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <View style={styles.root}>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.body}>
          The screen hit an unexpected error. Your data is safe — tap below to reload it.
        </Text>
        <Pressable
          style={({ pressed }) => [styles.btn, pressed && { opacity: 0.75 }]}
          onPress={this.reset}
        >
          <Text style={styles.btnText}>Reload</Text>
        </Pressable>
        {__DEV__ ? (
          <ScrollView style={styles.devBox} contentContainerStyle={{ padding: 12 }}>
            <Text style={styles.devText}>{error.message}</Text>
            {!!error.stack && <Text style={styles.devText}>{error.stack}</Text>}
          </ScrollView>
        ) : null}
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 12, backgroundColor: '#121212' },
  title: { fontSize: 18, fontWeight: '600', color: '#fefdfd', textAlign: 'center' },
  body: { fontSize: 14, lineHeight: 20, color: '#cdc8c5', textAlign: 'center' },
  btn: {
    marginTop: 8,
    minWidth: 160,
    borderRadius: 999,
    paddingHorizontal: 22,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: '#fefdfd',
  },
  btnText: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  devBox: { marginTop: 16, maxHeight: 220, alignSelf: 'stretch', backgroundColor: '#1a1a1a', borderRadius: 8 },
  devText: { fontSize: 11, color: '#FF8A80', fontFamily: 'JetBrainsMono-Regular' },
});
