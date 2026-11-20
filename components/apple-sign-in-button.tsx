import { useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';

import { createAppleSignInNonce, signInWithAppleIdentityToken, type Session } from '@/lib/auth';

export function AppleSignInButton({
  isDark,
  disabled,
  onSuccess,
  onError,
}: {
  isDark: boolean;
  disabled?: boolean;
  onSuccess: (session: Session) => void;
  onError: (message: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  if (Platform.OS !== 'ios') return null;

  const handlePress = async () => {
    if (loading || disabled) return;
    setLoading(true);
    try {
      const { nonce, requestNonce } = await createAppleSignInNonce();
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL],
        nonce: requestNonce,
      });
      if (!credential.identityToken) {
        throw new Error('Apple did not return an identity token. Please try again.');
      }
      onSuccess(await signInWithAppleIdentityToken(credential.identityToken, nonce));
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error
        ? String(error.code)
        : '';
      if (code === 'ERR_REQUEST_CANCELED') return;
      onError(error instanceof Error ? error.message : 'Apple sign-in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <AppleAuthentication.AppleAuthenticationButton
        buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
        buttonStyle={isDark
          ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
          : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
        cornerRadius={5}
        style={styles.button}
        onPress={() => void handlePress()}
      />
      {(loading || disabled) ? (
        <View style={styles.overlay} pointerEvents="none">
          <ActivityIndicator size="small" color={isDark ? '#000' : '#fff'} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch', marginTop: 10, position: 'relative' },
  button: { width: '100%', height: 48 },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
});
