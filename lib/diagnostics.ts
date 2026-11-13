import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { checkGatewayHealth, GATEWAY_HOSTS } from './gateway-client';
import { getCrashLog } from './crash-log';

/**
 * Builds a support-safe report. This intentionally contains no chat text,
 * document text, email, access token, headers, or request payload.
 */
export async function buildSafeDiagnosticReport() {
  const health = await checkGatewayHealth();
  const crashes = await getCrashLog();
  return {
    generatedAt: new Date().toISOString(),
    appVersion: Constants.expoConfig?.version || 'unknown',
    platform: Platform.OS,
    platformVersion: String(Platform.Version),
    gateway: {
      status: health.status,
      version: health.version || 'unknown',
      capabilities: health.capabilities || {},
      configuredOrigins: GATEWAY_HOSTS.length,
    },
    localErrors: crashes.slice(0, 10).map((item) => ({
      at: new Date(item.at).toISOString(),
      kind: item.kind,
      message: item.message.slice(0, 160),
    })),
  };
}

export async function buildSafeDiagnosticText(): Promise<string> {
  return JSON.stringify(await buildSafeDiagnosticReport(), null, 2);
}
