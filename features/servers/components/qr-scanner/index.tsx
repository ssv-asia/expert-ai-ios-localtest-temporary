import { useState, useRef, useEffect, useCallback } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  ActivityIndicator,
} from "react-native";
import { X, Wifi, Check, AlertCircle } from "lucide-react-native";

import { Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  parseConnectUrl,
  buildServerAddress,
  type ConnectParams,
} from "../../utils/parse-connect-url";
import { useAuthStore } from "@/features/auth/store";
import { useServersStore } from "@/features/servers/store";
import { useRouter } from "expo-router";
import { QrScannerScanPanel } from "./scan-panel";
import { getSession } from "@/lib/auth";
import { resilientFetch } from "@/lib/gateway-client";

type AccountDevice = { deviceId: string; name: string; connectUrl: string; updatedAt: number };
type DeviceDiscoveryState = "loading" | "ready" | "error";

type Step = "scan" | "pick-ip" | "pairing" | "done" | "error";

interface QrScannerProps {
  visible: boolean;
  onClose: () => void;
  onNeedNewWorkspace?: () => void;
}

export function QrScanner({ visible, onClose, onNeedNewWorkspace }: QrScannerProps) {
  const colorScheme = useColorScheme() ?? "light";
  const isDark = colorScheme === "dark";
  const router = useRouter();
  const mountedRef = useRef(true);

  const [scanned, setScanned] = useState(false);
  const [connectParams, setConnectParams] = useState<ConnectParams | null>(null);
  const [manualUrl, setManualUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("scan");
  const [accountDevices, setAccountDevices] = useState<AccountDevice[]>([]);
  const [deviceDiscoveryState, setDeviceDiscoveryState] = useState<DeviceDiscoveryState>("loading");
  const [deviceDiscoveryError, setDeviceDiscoveryError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [codeConnecting, setCodeConnecting] = useState(false);
  const [showWebScanner, setShowWebScanner] = useState(false);

  const refreshAccountDevices = useCallback(async (active?: () => boolean) => {
    const isActive = () => active?.() ?? true;
    try {
      const session = await getSession();
      if (!session?.token) {
        if (isActive()) {
          setAccountDevices([]);
          setDeviceDiscoveryState("error");
          setDeviceDiscoveryError("Sign in to see computers connected to your account.");
        }
        return;
      }
      const response = await resilientFetch('/v1/agent/devices', {
        headers: { authorization: `Bearer ${session.token}` },
      }, { retries: 0, attemptTimeoutMs: 5000 });
      if (!response.ok) throw new Error(`Computer discovery returned ${response.status}.`);
      const data = await response.json();
      const devices = Array.isArray(data.devices)
        ? data.devices.filter((item: unknown): item is AccountDevice => {
            if (!item || typeof item !== "object") return false;
            const device = item as Partial<AccountDevice>;
            return typeof device.deviceId === "string"
              && typeof device.name === "string"
              && typeof device.connectUrl === "string"
              && !!parseConnectUrl(device.connectUrl);
          })
        : [];
      if (isActive()) {
        setAccountDevices(devices);
        setDeviceDiscoveryState("ready");
        setDeviceDiscoveryError(null);
      }
    } catch (err) {
      if (isActive()) {
        setDeviceDiscoveryState("error");
        setDeviceDiscoveryError(err instanceof Error ? err.message : "Could not load your computers.");
      }
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    setDeviceDiscoveryState("loading");
    setDeviceDiscoveryError(null);
    void refreshAccountDevices(() => active);
    const timer = setInterval(() => void refreshAccountDevices(() => active), 15000);
    return () => { active = false; clearInterval(timer); };
  }, [visible, refreshAccountDevices]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const textPrimary = isDark ? "#fefdfd" : "#1a1a1a";
  const textMuted = isDark ? "#cdc8c5" : "#888";
  const cardBg = isDark ? "#1e1e1e" : "#FFFFFF";
  const borderColor = isDark ? "#3b3a39" : "rgba(0,0,0,0.08)";
  const inputBg = isDark ? "#2a2a2a" : "#F6F6F6";

  const reset = () => {
    setScanned(false);
    setConnectParams(null);
    setError(null);
    setManualUrl("");
    setStep("scan");
    setShowWebScanner(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  // A QR pairing request is a ONE-TIME, single-pending operation on the backend:
  // the desktop auto-approves the first pair request it sees for a given qr_id and
  // consumes it. Firing several pairWithServer() calls at the same qr_id in
  // parallel collides on that guard (and on the single auto-approve prompt),
  // leaving pairing wedged on "Waiting for approval". So we try candidates STRICTLY
  // one at a time and stop on the first success — no racing.
  //
  // LAN is tried first for lower latency. The relay supports HTTP requests and
  // streamed SSE responses, so it remains a working fallback across networks.
  const LAN_TIMEOUT_MS = 4000;
  // The relay can take a few seconds to be ready right after the desktop app
  // (re)starts -- its WebSocket to Cloudflare must (re)connect before a tunneled
  // request has anyone to answer it -- so it gets a longer, but still bounded,
  // allowance. Without a bound a cold relay would hang on "Waiting for approval".
  const RELAY_TIMEOUT_MS = 15000;

  const tryPair = (address: string, qrId: string, serverId: string, timeoutMs?: number) => {
    const attempt = useAuthStore.getState().pairWithServer(address, qrId, serverId);
    if (!timeoutMs) return attempt;
    return Promise.race([
      attempt,
      new Promise<{ success: boolean; error?: string }>((resolve) =>
        setTimeout(
          () => resolve({ success: false, error: "Could not reach the server. Make sure Expert AI Agent is running on your computer and try again." }),
          timeoutMs,
        ),
      ),
    ]);
  };

  // Try each LAN candidate serially (never in parallel), first reachable one wins.
  const tryLanSerial = async (
    ips: string[],
    port: string,
    qrId: string,
    serverId: string,
  ): Promise<{ success: boolean; error?: string; address?: string }> => {
    let lastError = "No LAN address reachable";
    for (const ip of ips) {
      const address = buildServerAddress(ip, port);
      const result = await tryPair(address, qrId, serverId, LAN_TIMEOUT_MS);
      if (result.success) return { ...result, address };
      if (result.error) lastError = result.error;
    }
    return { success: false, error: lastError };
  };

  const doPair = async (params: ConnectParams, ip: string) => {
    const serverId =
      params.serverId ??
      Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const existingServer = useServersStore
      .getState()
      .servers.find((server) => server.id === serverId);

    setStep("pairing");
    setError(null);

    let result: { success: boolean; error?: string; address?: string };
    let usedAddress: string;

    if (ip) {
      // A specific address was chosen (single-IP QR, or the user picked one).
      const address = buildServerAddress(ip, params.port);
      result = await tryPair(address, params.qrId, serverId, LAN_TIMEOUT_MS);
      usedAddress = address;
      // Fall back to the relay if that one address didn't answer.
      if (!result.success && params.relay) {
        result = await tryPair(params.relay, params.qrId, serverId, RELAY_TIMEOUT_MS);
        usedAddress = params.relay;
      }
    } else {
      // No specific IP: try every LAN candidate one at a time, then relay.
      result = await tryLanSerial(params.ips, params.port, params.qrId, serverId);
      usedAddress = result.address ?? "";
      if (!result.success && params.relay) {
        result = await tryPair(params.relay, params.qrId, serverId, RELAY_TIMEOUT_MS);
        usedAddress = params.relay;
      }
    }

    if (result.success) {
      setStep("done");
      setTimeout(async () => {
        if (!mountedRef.current) return;
        try {
          await useServersStore.getState().addServer({
            id: serverId,
            name: existingServer?.name || params.hostname || ip,
            address: usedAddress,
          });
          if (!mountedRef.current) return;
          reset();
          onClose();
          requestAnimationFrame(() => router.push('/agent-chat'));
        } catch (err) {
          console.error('[QR Scanner] Failed to save server to secure storage:', err);
          if (!mountedRef.current) return;
          setStep("error");
          setError(`Failed to save server configuration. ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      }, 800);
    } else {
      setStep("error");
      setError(result.error ?? "Pairing failed");
    }
  };

  const handleScanned = (data: string) => {
    const params = parseConnectUrl(data);
    if (!params) {
      setError("Invalid QR code. Expected a pi://connect URL.");
      setScanned(false);
      return;
    }

    setConnectParams(params);
    if (params.ips.length === 1) {
      // Only one candidate — pair against it directly (relay is the fallback).
      doPair(params, params.ips[0]);
    } else {
      // Multiple candidates: try each LAN address serially, then relay. Passing
      // no specific IP tells doPair to walk the list one at a time (no picker,
      // no parallel racing).
      doPair(params, "");
    }
  };

  const handleBarCodeScanned = (data: string) => {
    if (scanned) return;
    setScanned(true);
    setError(null);
    handleScanned(data);
  };

  const handleManualSubmit = () => {
    const trimmed = manualUrl.trim();
    if (!trimmed) return;
    setScanned(true);
    handleScanned(trimmed);
  };

  const connectAccountDevice = async (deviceId: string) => {
    if (scanned) return;
    try {
      const session = await getSession();
      if (!session?.token) throw new Error('Sign in to Expert AI to connect this computer.');
      const response = await resilientFetch('/v1/agent/devices', {
        headers: { authorization: `Bearer ${session.token}` },
      }, { retries: 0, attemptTimeoutMs: 4000 });
      if (!response.ok) throw new Error('Computer discovery is unavailable. Scan its QR code instead.');
      const data = await response.json();
      const device = (data.devices as AccountDevice[] | undefined)?.find((item) => item.deviceId === deviceId);
      if (!device) throw new Error('Computer is offline. Scan its QR code if it is open.');
      setScanned(true);
      handleScanned(device.connectUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not connect to computer.');
    }
  };

  const connectWithCode = async () => {
    const code = manualCode.toUpperCase().replace(/[^A-Z2-9]/g, "");
    if (!/^[A-HJ-NP-Z2-9]{8}$/.test(code)) {
      setError("Enter the 8-character off-Wi-Fi code shown in Expert AI Agent settings.");
      return;
    }
    setCodeConnecting(true);
    setError(null);
    try {
      const session = await getSession();
      if (!session?.token) throw new Error("Sign in with the same Expert AI account as your computer to use a pairing code.");
      const response = await resilientFetch('/v1/agent/devices', {
        headers: { authorization: `Bearer ${session.token}` },
      }, { retries: 0, attemptTimeoutMs: 5000 });
      if (!response.ok) throw new Error("Computer discovery is unavailable. Scan the computer's QR code instead.");
      const data = await response.json();
      const devices = Array.isArray(data.devices) ? data.devices as AccountDevice[] : [];
      const match = devices.find((device) => {
        const connection = parseConnectUrl(device.connectUrl);
        const relayCode = connection?.relay?.match(/\/tunnel\/([A-Z2-9]{8})(?:\/|$)/i)?.[1];
        return relayCode?.toUpperCase() === code;
      });
      if (!match) throw new Error("No computer for this code is available on this account. Use the QR scanner to pair across accounts.");
      setScanned(true);
      handleScanned(match.connectUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect with this code.");
    } finally {
      setCodeConnecting(false);
    }
  };

  const openConnectedDevice = async (device: AccountDevice) => {
    const params = parseConnectUrl(device.connectUrl);
    const serverId = params?.serverId;
    if (!serverId) return;
    const server = useServersStore.getState().servers.find((item) => item.id === serverId);
    if (!server) return;
    setScanned(true);
    try {
      // A saved LAN address can go stale after a network change. Discovery has
      // the current relay address, so refresh it before opening the saved session.
      const address = params.relay || (params.ips[0] ? buildServerAddress(params.ips[0], params.port) : server.address);
      if (address !== server.address) {
        await useServersStore.getState().updateServer(serverId, { address });
      }
      const activated = await useAuthStore.getState().activateServer({ ...server, address });
      if (!activated) {
        setScanned(false);
        handleScanned(device.connectUrl);
        return;
      }
      handleClose();
      requestAnimationFrame(() => router.push('/agent-chat'));
    } catch (err) {
      setScanned(false);
      setError(err instanceof Error ? err.message : 'Could not open Agent Chat.');
    }
  };

  const handleSelectIp = (ip: string) => {
    if (!connectParams) return;
    doPair(connectParams, ip);
  };

  // Pairing in progress
  if (step === "pairing") {
    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
        <View style={[styles.overlay, { backgroundColor: isDark ? "rgba(0,0,0,0.6)" : "rgba(0,0,0,0.3)" }]}>
          <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
            <View style={styles.statusCenter}>
              <ActivityIndicator size="large" color={textPrimary} />
              <Text style={[styles.statusTitle, { color: textPrimary }]}>
                Waiting for approval
              </Text>
              <Text style={[styles.statusDesc, { color: textMuted }]}>
                Check the server terminal and accept the pairing request.
              </Text>
            </View>
            <Pressable onPress={handleClose} style={[styles.cancelBtn, { borderColor }]}>
              <Text style={[styles.cancelBtnText, { color: textMuted }]}>
                Cancel
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    );
  }

  // Pairing success
  if (step === "done") {
    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => {}}>
        <View style={[styles.overlay, { backgroundColor: isDark ? "rgba(0,0,0,0.6)" : "rgba(0,0,0,0.3)" }]}>
          <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
            <View style={styles.statusCenter}>
              <View style={[styles.successCircle, { backgroundColor: isDark ? "#30D158" : "#34C759" }]}>
                <Check size={28} color="#fff" strokeWidth={2.5} />
              </View>
              <Text style={[styles.statusTitle, { color: textPrimary }]}>
                Connected
              </Text>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  // Pairing error
  if (step === "error") {
    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
        <View style={[styles.overlay, { backgroundColor: isDark ? "rgba(0,0,0,0.6)" : "rgba(0,0,0,0.3)" }]}>
          <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
            <View style={styles.statusCenter}>
              <View style={[styles.errorCircle, { backgroundColor: isDark ? "#FF453A" : "#FF3B30" }]}>
                <AlertCircle size={28} color="#fff" strokeWidth={2} />
              </View>
              <Text style={[styles.statusTitle, { color: textPrimary }]}>
                Pairing Failed
              </Text>
              <Text style={[styles.statusDesc, { color: textMuted }]}>
                {error}
              </Text>
            </View>
            <View style={styles.errorActions}>
              <Pressable onPress={reset} style={[styles.retryBtn, { backgroundColor: isDark ? "#fefdfd" : "#1a1a1a" }]}>
                <Text style={[styles.retryBtnText, { color: isDark ? "#1a1a1a" : "#fff" }]}>
                  Try Again
                </Text>
              </Pressable>
              <Pressable onPress={handleClose} style={[styles.cancelBtn, { borderColor }]}>
                <Text style={[styles.cancelBtnText, { color: textMuted }]}>
                  Cancel
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  // IP selection screen
  if (step === "pick-ip" && connectParams) {
    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
        <View style={[styles.overlay, { backgroundColor: isDark ? "rgba(0,0,0,0.6)" : "rgba(0,0,0,0.3)" }]}>
          <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
            <View style={styles.cardHeader}>
              <Text style={[styles.cardTitle, { color: textPrimary }]}>
                Select Network
              </Text>
              <Pressable onPress={handleClose} style={styles.closeBtn}>
                <X size={18} color={textMuted} strokeWidth={1.8} />
              </Pressable>
            </View>
            <Text style={[styles.cardSubtitle, { color: textMuted }]}>
              {connectParams.hostname
                ? `"${connectParams.hostname}" is available on multiple addresses:`
                : "Multiple addresses found:"}
            </Text>
            <View style={styles.ipList}>
              {connectParams.ips.map((ip) => (
                <Pressable
                  key={ip}
                  onPress={() => handleSelectIp(ip)}
                  style={({ pressed }) => [
                    styles.ipRow,
                    { borderColor, backgroundColor: pressed ? (isDark ? "#2a2a2a" : "#F6F6F6") : "transparent" },
                  ]}
                >
                  <Wifi size={16} color={textMuted} strokeWidth={1.8} />
                  <View style={styles.ipInfo}>
                    <Text style={[styles.ipText, { color: textPrimary }]}>{ip}</Text>
                    <Text style={[styles.ipPort, { color: textMuted }]}>
                      Port {connectParams.port}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  // Scan screen
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={[styles.overlay, { backgroundColor: isDark ? "rgba(0,0,0,0.6)" : "rgba(0,0,0,0.3)" }]}>
        <View style={[styles.card, styles.scannerCard, { backgroundColor: cardBg, borderColor }]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color: textPrimary }]}>
              Connect to a computer
            </Text>
            <Pressable onPress={handleClose} style={styles.closeBtn}>
              <X size={18} color={textMuted} strokeWidth={1.8} />
            </Pressable>
          </View>

          <View style={styles.manualSection}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={[styles.manualLabel, { color: textMuted }]}>Your computers</Text>
              {deviceDiscoveryState === "loading" && <ActivityIndicator size="small" color={textMuted} />}
              {deviceDiscoveryState === "error" && (
                <Pressable onPress={() => void refreshAccountDevices()} accessibilityLabel="Retry computer discovery">
                  <Text style={[styles.manualLabel, { color: textPrimary }]}>Retry</Text>
                </Pressable>
              )}
            </View>
            {deviceDiscoveryState === "error" ? (
              <Text style={[styles.cardSubtitle, { color: textMuted }]}>
                {deviceDiscoveryError} You can still scan the QR code below.
              </Text>
            ) : null}
            {deviceDiscoveryState === "ready" && accountDevices.length === 0 ? (
              <Text style={[styles.cardSubtitle, { color: textMuted }]}>No computers are currently available on this account. Scan a QR code to connect one.</Text>
            ) : null}
            {accountDevices.length > 0 && (
              <ScrollView style={{ maxHeight: 160 }} nestedScrollEnabled>
              {accountDevices.map((device) => {
                const params = parseConnectUrl(device.connectUrl);
                if (!params) return null;
                const connected = useServersStore.getState().servers.some((server) => server.id === params.serverId);
                return (
                  <Pressable
                    key={device.deviceId}
                    onPress={() => {
                      if (connected) {
                        openConnectedDevice(device);
                      } else {
                        connectAccountDevice(device.deviceId);
                      }
                    }}
                    disabled={scanned}
                    style={[styles.manualRow, { alignItems: 'center', justifyContent: 'space-between' }]}
                  >
                    <Text style={[styles.cardSubtitle, { color: textPrimary }]}>{device.name}</Text>
                    <Text style={[styles.manualLabel, { color: textMuted }]}>{connected ? 'Open Agent Chat' : 'Connect'}</Text>
                  </Pressable>
                );
              })}
              </ScrollView>
            )}
          </View>

          {Platform.OS !== "web" && (
            <View style={styles.manualSection}>
              <Text style={[styles.manualLabel, { color: textMuted }]}>Connect with a code</Text>
              <View style={styles.manualRow}>
                <TextInput
                  style={[styles.manualInput, { backgroundColor: inputBg, color: textPrimary, borderColor, letterSpacing: 2, textTransform: "uppercase" }]}
                  value={manualCode}
                  onChangeText={(value) => { setManualCode(value.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 8)); setError(null); }}
                  placeholder="8-CHARACTER CODE"
                  placeholderTextColor={isDark ? "#666" : "#bbb"}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={8}
                  accessibilityLabel="Off-Wi-Fi pairing code"
                />
                <Pressable
                  onPress={() => void connectWithCode()}
                  disabled={codeConnecting || manualCode.length !== 8}
                  style={[styles.manualBtn, { backgroundColor: isDark ? "#fefdfd" : "#1a1a1a", opacity: codeConnecting || manualCode.length !== 8 ? 0.5 : 1 }]}
                >
                  {codeConnecting ? <ActivityIndicator size="small" color={isDark ? "#1a1a1a" : "#fff"} /> : <Text style={[styles.manualBtnText, { color: isDark ? "#1a1a1a" : "#fff" }]}>Connect</Text>}
                </Pressable>
              </View>
              <Text style={[styles.cardSubtitle, { color: textMuted }]}>Uses your signed-in account and a computer registered to it.</Text>
            </View>
          )}

          {Platform.OS === 'web' && !showWebScanner ? (
            <Pressable
              onPress={() => setShowWebScanner(true)}
              style={[styles.manualRow, { justifyContent: 'center', borderColor }]}
            >
              <Text style={[styles.manualLabel, { color: textPrimary }]}>Scan a desktop QR code</Text>
            </Pressable>
          ) : (
            <QrScannerScanPanel
              visible={visible}
              scanned={scanned}
              isDark={isDark}
              textMuted={textMuted}
              onBarcodeData={handleBarCodeScanned}
            />
          )}

          {/* Manual URL entry is an additional browser pairing option. */}
          {Platform.OS === "web" && (
            <View style={styles.manualSection}>
              <Text style={[styles.manualLabel, { color: textMuted }]}>
                Paste connect URL
              </Text>
              <View style={styles.manualRow}>
                <TextInput
                  style={[styles.manualInput, { backgroundColor: inputBg, color: textPrimary, borderColor }]}
                  value={manualUrl}
                  onChangeText={(t) => { setManualUrl(t); setError(null); }}
                  placeholder="pi://connect?..."
                  placeholderTextColor={isDark ? "#666" : "#bbb"}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Pressable
                  onPress={handleManualSubmit}
                  style={[styles.manualBtn, { backgroundColor: isDark ? "#fefdfd" : "#1a1a1a" }, !manualUrl.trim() && { opacity: 0.4 }]}
                  disabled={!manualUrl.trim()}
                >
                  <Text style={[styles.manualBtnText, { color: isDark ? "#1a1a1a" : "#fff" }]}>
                    Connect
                  </Text>
                </Pressable>
              </View>
            </View>
          )}

          {error && (
            <Text style={[styles.errorText, { color: isDark ? "#FF453A" : "#FF3B30" }]}>
              {error}
            </Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 12,
    borderWidth: 0.633,
    padding: 24,
    gap: 16,
  },
  scannerCard: {
    maxWidth: 440,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardTitle: {
    fontSize: 17,
    fontFamily: Fonts.sansSemiBold,
  },
  cardSubtitle: {
    fontSize: 14,
    fontFamily: Fonts.sans,
    lineHeight: 20,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  manualSection: {
    gap: 8,
  },
  manualLabel: {
    fontSize: 12,
    fontFamily: Fonts.sansMedium,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  manualRow: {
    flexDirection: "row",
    gap: 8,
  },
  manualInput: {
    flex: 1,
    height: 40,
    borderRadius: 6,
    borderWidth: 0.633,
    paddingHorizontal: 12,
    fontSize: 14,
    fontFamily: Fonts.sans,
  },
  manualBtn: {
    paddingHorizontal: 16,
    height: 40,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  manualBtnText: {
    fontSize: 13,
    fontFamily: Fonts.sansSemiBold,
  },
  errorText: {
    fontSize: 13,
    fontFamily: Fonts.sans,
  },
  statusCenter: {
    alignItems: "center",
    paddingVertical: 24,
    gap: 12,
  },
  statusTitle: {
    fontSize: 17,
    fontFamily: Fonts.sansSemiBold,
    marginTop: 4,
  },
  statusDesc: {
    fontSize: 14,
    fontFamily: Fonts.sans,
    textAlign: "center",
    lineHeight: 20,
  },
  successCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  errorCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  errorActions: {
    gap: 8,
  },
  retryBtn: {
    height: 44,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  retryBtnText: {
    fontSize: 15,
    fontFamily: Fonts.sansSemiBold,
  },
  cancelBtn: {
    height: 44,
    borderRadius: 8,
    borderWidth: 0.633,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnText: {
    fontSize: 15,
    fontFamily: Fonts.sansSemiBold,
  },
  ipList: {
    gap: 4,
  },
  ipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 0.633,
  },
  ipInfo: {
    flex: 1,
  },
  ipText: {
    fontSize: 14,
    fontFamily: Fonts.sansMedium,
  },
  ipPort: {
    fontSize: 12,
    fontFamily: Fonts.sans,
    marginTop: 1,
  },
});
