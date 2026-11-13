import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { QrCode } from "lucide-react-native";

import { Fonts } from "@/constants/theme";

interface QrScannerScanPanelProps {
  visible: boolean;
  scanned: boolean;
  isDark: boolean;
  textMuted: string;
  onBarcodeData: (data: string) => void;
}

export function QrScannerScanPanel({
  visible,
  scanned,
  isDark,
  textMuted,
  onBarcodeData,
}: QrScannerScanPanelProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setCameraReady(false);
      setCameraError(null);
    }
  }, [visible]);

  if (!permission) {
    return (
      <View style={styles.messageWrap}>
        <ActivityIndicator size="small" color={textMuted} />
      </View>
    );
  }

  if (!permission.granted) {
    const secureContext = typeof window === "undefined" || window.isSecureContext;
    return (
      <View style={styles.messageWrap}>
        <QrCode size={32} color={textMuted} strokeWidth={1.4} />
        <Text style={[styles.message, { color: textMuted }]}>
          {secureContext
            ? "Allow camera access to scan the desktop QR code."
            : "Camera access needs a secure HTTPS page. Paste the connect URL below."}
        </Text>
        {secureContext && (
          <Pressable
            onPress={() => requestPermission()}
            style={[styles.permissionButton, { backgroundColor: isDark ? "#fefdfd" : "#1a1a1a" }]}
          >
            <Text style={[styles.permissionButtonText, { color: isDark ? "#1a1a1a" : "#fff" }]}>Allow camera</Text>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <View style={styles.cameraWrap}>
      <CameraView
        active={visible}
        facing="back"
        style={styles.camera}
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={scanned ? undefined : ({ data }) => onBarcodeData(data)}
        onCameraReady={() => { setCameraReady(true); setCameraError(null); }}
        onMountError={(event) => { setCameraReady(false); setCameraError(event.message || "Camera preview could not start."); }}
      />
      {!cameraReady && !cameraError && (
        <View style={styles.overlay}>
          <ActivityIndicator size="small" color="#fff" />
          <Text style={styles.overlayText}>Starting camera…</Text>
        </View>
      )}
      {cameraError && (
        <View style={styles.errorWrap}>
          <Text style={[styles.message, { color: textMuted }]}>{cameraError}</Text>
          <Pressable onPress={() => { setCameraError(null); setCameraReady(false); requestPermission(); }}>
            <Text style={styles.retryText}>Try camera again</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  messageWrap: {
    minHeight: 150,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 16,
  },
  message: {
    fontSize: 14,
    fontFamily: Fonts.sans,
    textAlign: "center",
    lineHeight: 20,
  },
  permissionButton: {
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  permissionButtonText: { fontSize: 13, fontFamily: Fonts.sansSemiBold },
  cameraWrap: {
    height: 220,
    overflow: "hidden",
    borderRadius: 10,
    backgroundColor: "#090909",
    position: "relative",
  },
  camera: { width: "100%", height: "100%" },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  overlayText: { color: "#fff", fontSize: 13, fontFamily: Fonts.sans },
  errorWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 16,
    backgroundColor: "rgba(0,0,0,0.8)",
  },
  retryText: { color: "#d5c4ff", fontSize: 13, fontFamily: Fonts.sansSemiBold },
});
