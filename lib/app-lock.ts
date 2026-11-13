// Optional biometric app lock — Face/Fingerprint, opt-in only, OFF by default.
// Three modes:
//   'off'       — never lock (default).
//   'incognito' — lock only when returning to the app while an incognito
//                 chat is the active conversation (the whole point of
//                 incognito is privacy; this is its natural companion).
//   'all'       — lock on every app resume/cold launch, regardless of chat.
// Fails OPEN, never closed: if the device has no biometric hardware or
// nothing enrolled, locking is silently treated as unavailable rather than
// trapping the user out of their own app.
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';

export type AppLockMode = 'off' | 'incognito' | 'all';

const STORE_KEY = 'expert-ai.app-lock-mode';

let cachedMode: AppLockMode | null = null;

export async function getAppLockMode(): Promise<AppLockMode> {
  if (cachedMode) return cachedMode;
  try {
    const raw = await SecureStore.getItemAsync(STORE_KEY);
    cachedMode = raw === 'incognito' || raw === 'all' ? raw : 'off';
  } catch {
    cachedMode = 'off';
  }
  return cachedMode;
}

export async function setAppLockMode(mode: AppLockMode): Promise<void> {
  cachedMode = mode;
  try {
    await SecureStore.setItemAsync(STORE_KEY, mode);
  } catch {
    /* best-effort — worst case the setting doesn't persist across restarts */
  }
}

/** Whether the device can actually do biometric auth right now (hardware +
 *  something enrolled). Locking must never be "required" on a device that
 *  can't satisfy it. */
export async function canUseBiometricLock(): Promise<boolean> {
  try {
    const [hasHardware, isEnrolled] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ]);
    return hasHardware && isEnrolled;
  } catch {
    return false;
  }
}

export async function authenticate(): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock Expert AI',
      disableDeviceFallback: false,
    });
    return result.success;
  } catch {
    return false;
  }
}
