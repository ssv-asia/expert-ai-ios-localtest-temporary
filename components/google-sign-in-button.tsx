// Native Google Sign-In — entirely in-app, no browser/webview hop. Uses Google's
// own <GoogleSigninButton> component for authentic, policy-compliant branding
// (exact colors/logo/sizing per Google's identity guidelines) rather than a
// hand-rolled lookalike. See lib/auth.ts's signInWithGoogleIdToken for the
// gateway exchange (POST /auth/google/verify — server-verified, no redirect).
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';
import {
  GoogleSignin,
  GoogleSigninButton,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';

import { signInWithGoogleIdToken, type Session } from '@/lib/auth';

// The "Web application" OAuth client ID configured on the gateway — the ID
// token's `aud` claim must match this exact client for the server-side verify
// to succeed. Do NOT swap this for an "Android"-type client ID; see the
// gateway's /auth/google/verify contract.
const WEB_CLIENT_ID = '1093163336745-590eg1hv03k7rnjot7cqqvct7vv08ceq.apps.googleusercontent.com';

declare global {
  interface Window {
    google?: any;
  }
}

function WebGoogleSignInButton({
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
  const hostRef = useRef<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !hostRef.current) return;
    let cancelled = false;
    const render = () => {
      if (cancelled || !hostRef.current || !window.google?.accounts?.id) return;
      hostRef.current.innerHTML = '';
      window.google.accounts.id.initialize({
        client_id: WEB_CLIENT_ID,
        callback: async (response: { credential?: string }) => {
          if (!response.credential || disabled) return;
          setLoading(true);
          try {
            onSuccess(await signInWithGoogleIdToken(response.credential));
          } catch (error) {
            onError(error instanceof Error ? error.message : 'Google sign-in failed.');
          } finally {
            setLoading(false);
          }
        },
      });
      window.google.accounts.id.renderButton(hostRef.current, {
        type: 'standard',
        theme: isDark ? 'filled_black' : 'outline',
        size: 'large',
        text: 'signin_with',
        shape: 'rectangular',
        logo_alignment: 'left',
        width: Math.min(400, Math.max(240, hostRef.current.clientWidth || 360)),
      });
    };
    const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      if (window.google?.accounts?.id) render();
      else existing.addEventListener('load', render, { once: true });
    } else {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.addEventListener('load', render, { once: true });
      document.head.appendChild(script);
    }
    return () => { cancelled = true; };
  }, [disabled, isDark, onError, onSuccess]);

  return (
    <View style={styles.webGoogleWrap}>
      <View ref={hostRef} collapsable={false} style={styles.webGoogleHost} />
      {loading ? <View style={styles.webGoogleLoading}><ActivityIndicator size="small" color={isDark ? '#fff' : '#202124'} /></View> : null}
    </View>
  );
}

let configured = false;
function ensureConfigured() {
  if (configured) return;
  GoogleSignin.configure({ webClientId: WEB_CLIENT_ID, offlineAccess: false });
  configured = true;
}

/** Clear Google's remembered account so the next sign-in can choose another one. */
export async function clearGoogleAccount(): Promise<void> {
  try {
    await GoogleSignin.signOut();
  } catch {
    // Google may have no cached account; local app sign-out must still succeed.
  }
}

export function GoogleSignInButton({
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

  if (Platform.OS === 'web') {
    return <WebGoogleSignInButton isDark={isDark} disabled={disabled} onSuccess={onSuccess} onError={onError} />;
  }

  const handlePress = async () => {
    if (loading || disabled) return;
    ensureConfigured();
    setLoading(true);
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const response = await GoogleSignin.signIn();
      if (!isSuccessResponse(response)) {
        // User cancelled the picker — not an error, just no-op back to the sheet.
        return;
      }
      const idToken = response.data.idToken;
      if (!idToken) {
        onError("Google didn't return an ID token. Please try again.");
        return;
      }
      const session = await signInWithGoogleIdToken(idToken);
      onSuccess(session);
    } catch (err) {
      if (isErrorWithCode(err)) {
        if (err.code === statusCodes.SIGN_IN_CANCELLED) return;
        if (err.code === statusCodes.IN_PROGRESS) {
          onError('A sign-in is already in progress.');
          return;
        }
        if (err.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
          onError('Google Play Services is unavailable or out of date on this device.');
          return;
        }
        if (err.code === '12500') {
          onError('Google could not complete sign-in (error 12500). Confirm the Android OAuth client uses package com.ssvasia.expertai and the Play App Signing SHA-1 for this app.');
          return;
        }
        // DEVELOPER_ERROR (10) almost always means the app's signing certificate
        // (the SHA-1 fingerprint of whatever signed this exact build) isn't
        // registered against an Android OAuth client in the same Google Cloud
        // project as WEB_CLIENT_ID above — see keystore.properties + Play
        // Console → Setup → App integrity for the two certificates (upload key
        // and, separately, Play App Signing) that both need to be registered.
        onError(`Google sign-in failed (code ${err.code}). Check the Android OAuth client package name and Play signing certificate.`);
        return;
      }
      onError(err instanceof Error ? err.message : 'Google sign-in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Sign in with Google"
        accessibilityState={{ disabled: Boolean(disabled || loading), busy: loading }}
        disabled={disabled || loading}
        onPress={handlePress}
        style={({ pressed }) => [styles.touchTarget, pressed && styles.pressed]}
      >
        {/* The official Google control remains the visual surface. Its native touch target is
            disabled because native buttons inside Android Modal surfaces can intermittently lose
            touch dispatch; the surrounding RN Pressable owns the reliable hit target. */}
        <GoogleSigninButton
          size={GoogleSigninButton.Size.Wide}
          color={isDark ? GoogleSigninButton.Color.Dark : GoogleSigninButton.Color.Light}
          onPress={() => {}}
          // The outer Pressable owns touch dispatch, but the native control must
          // stay visually enabled; disabled=true makes Google's button gray.
          disabled={false}
          pointerEvents="none"
          style={styles.button}
        />
      </Pressable>
      {loading ? (
        <View style={styles.spinnerOverlay} pointerEvents="none">
          <ActivityIndicator size="small" color={isDark ? '#fff' : '#1A1A1A'} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'stretch',
    marginTop: 10,
    position: 'relative',
  },
  touchTarget: {
    alignSelf: 'stretch',
    minHeight: 48,
    borderRadius: 4,
    overflow: 'hidden',
  },
  pressed: {
    opacity: 0.78,
  },
  button: {
    width: '100%',
    height: 48,
  },
  webGoogleWrap: { alignSelf: 'stretch', minHeight: 48, marginTop: 10, position: 'relative' },
  webGoogleHost: { alignSelf: 'stretch', minHeight: 48, alignItems: 'center' },
  webGoogleLoading: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  spinnerOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
