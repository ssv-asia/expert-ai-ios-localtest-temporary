// GitHub sign-in via OAuth Device Flow — deliberately NOT the redirect-based
// "Authorization Code" flow, because that requires a client_secret to
// exchange the code for a token, and a client_secret can never safely ship
// inside an APK (anyone can decompile it and mint tokens as this app).
// Device Flow is designed for exactly this case (see GitHub's own docs):
// the token-polling request needs only the public client_id — no secret,
// no backend, no redirect URI. Confirmed against GitHub's OAuth Apps docs
// before building this (not assumed) — "research before guessing."
//
// Flow: request a device_code + short user_code -> show the user_code and
// send them to github.com/login/device to approve it in their own browser ->
// poll the token endpoint until they do (or it expires).
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { GATEWAY_BASE_URL } from './gateway-client';

const TOKEN_KEY = 'github_access_token_v1';

// A real, registered GitHub OAuth App's client ID — public by design (every
// GitHub OAuth App's client_id is visible in its authorization URL). Backing
// EXPO_PUBLIC_GITHUB_CLIENT_ID lets this be swapped without a code change
// once the app is registered; see the Settings > GitHub section prompt if
// it's unset.
export const GITHUB_CLIENT_ID = process.env.EXPO_PUBLIC_GITHUB_CLIENT_ID ?? '';

// Full read/write repo access — needed to actually commit edits back, which
// is the entire point of this feature (an Obsidian-vault-style synced notes
// repo, not a read-only viewer).
const SCOPE = 'repo';

function getWebToken(): string | null {
  if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

function setWebToken(token: string): void {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') localStorage.setItem(TOKEN_KEY, token);
}

function deleteWebToken(): void {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') localStorage.removeItem(TOKEN_KEY);
}

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

export async function requestDeviceCode(): Promise<DeviceCodeResponse> {
  if (!GITHUB_CLIENT_ID) throw new Error('GitHub sign-in is not configured for this web build.');
  const endpoint = Platform.OS === 'web'
    ? `${GATEWAY_BASE_URL}/github/device/code`
    : 'https://github.com/login/device/code';
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: GITHUB_CLIENT_ID, scope: SCOPE }),
  });
  if (!res.ok) throw new Error('Could not start GitHub sign-in. Please try again.');
  const data = await res.json();
  if (!data.device_code) throw new Error(data.error_description || 'GitHub did not return a device code.');
  return data;
}

export type PollResult = { status: 'pending' } | { status: 'slow_down'; interval: number } | { status: 'success'; token: string } | { status: 'error'; message: string };

async function pollOnce(deviceCode: string): Promise<PollResult> {
  const endpoint = Platform.OS === 'web'
    ? `${GATEWAY_BASE_URL}/github/device/token`
    : 'https://github.com/login/oauth/access_token';
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    }),
  });
  const data = await res.json();
  if (data.access_token) return { status: 'success', token: data.access_token };
  if (data.error === 'authorization_pending') return { status: 'pending' };
  if (data.error === 'slow_down') return { status: 'slow_down', interval: data.interval ?? 5 };
  if (data.error === 'expired_token') return { status: 'error', message: 'This sign-in code expired. Please try again.' };
  if (data.error === 'access_denied') return { status: 'error', message: 'Sign-in was declined.' };
  return { status: 'error', message: data.error_description || 'GitHub sign-in failed.' };
}

/** Polls until the user approves (or it expires/fails), then saves the token.
 *  `onTick` lets the caller show "still waiting…" without owning the loop. */
export async function pollForToken(
  device: DeviceCodeResponse,
  onTick?: () => void,
): Promise<string> {
  let interval = device.interval;
  const deadline = Date.now() + device.expires_in * 1000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, interval * 1000));
    onTick?.();
    const result = await pollOnce(device.device_code);
    if (result.status === 'success') {
      if (Platform.OS === 'web') setWebToken(result.token);
      else await SecureStore.setItemAsync(TOKEN_KEY, result.token);
      return result.token;
    }
    if (result.status === 'slow_down') interval = result.interval;
    if (result.status === 'error') throw new Error(result.message);
    // 'pending' — keep polling.
  }
  throw new Error('This sign-in code expired. Please try again.');
}

export async function getGithubToken(): Promise<string | null> {
  try {
    if (Platform.OS === 'web') return getWebToken();
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function disconnectGithub(): Promise<void> {
  try {
    if (Platform.OS === 'web') deleteWebToken();
    else await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    // best-effort
  }
}
