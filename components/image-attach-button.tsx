// Attach-image button for the chat composer. Always analyzes the image
// on-device first (private, free, works for every model) and shows the
// result before anything is sent — the user decides whether to send just the
// extracted text (default, works for anyone) or the actual image too
// (only offered when the signed-in tier's model can see images).
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View, type LayoutChangeEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Fonts } from '@/constants/theme';
import { pickAndAnalyzeImage, type PickedImage } from '@/lib/image-upload';
import { describeAnalysis } from '@/lib/image-analysis';

export function ImageAttachButton({
  color,
  disabled,
  canSendRawImage,
  onConfirm,
  onLayout,
}: {
  color: string;
  disabled?: boolean;
  /** True when the current tier's model is vision-capable, so "Send image too" can be offered. */
  canSendRawImage: boolean;
  onConfirm: (picked: PickedImage, sendRawImage: boolean) => void;
  onLayout?: (event: LayoutChangeEvent) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<PickedImage | null>(null);

  const handlePress = async () => {
    setBusy(true);
    try {
      const picked = await pickAndAnalyzeImage(false);
      if (picked) setPreview(picked);
    } catch {
      // Best-effort — picker/analysis failure just means nothing happens.
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Pressable
        onLayout={onLayout}
        onPress={handlePress}
        disabled={disabled || busy}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Attach image"
        style={{ opacity: disabled ? 0.4 : 1, height: 40, width: 40, alignItems: 'center', justifyContent: 'center' }}
      >
        {busy ? <ActivityIndicator size="small" color={color} /> : <Ionicons name="image-outline" size={22} color={color} />}
      </Pressable>

      <Modal visible={!!preview} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#1c1c1e', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, maxHeight: '80%' }}>
            {preview ? (
              <>
                <Image source={{ uri: preview.uri }} style={{ width: '100%', height: 180, borderRadius: 12, marginBottom: 12 }} contentFit="cover" />
                <ScrollView style={{ maxHeight: 140 }}>
                  <Text style={{ fontFamily: Fonts.sans, fontSize: 13, color: '#e5e5ea', lineHeight: 19 }}>
                    {describeAnalysis(preview.analysis)}
                  </Text>
                </ScrollView>
                <View style={{ gap: 8, marginTop: 16 }}>
                  <Pressable
                    onPress={() => { onConfirm(preview, false); setPreview(null); }}
                    style={{ backgroundColor: '#2c2c2e', borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}
                  >
                    <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 15, color: '#fff' }}>Send extracted text (private, on-device)</Text>
                  </Pressable>
                  {canSendRawImage ? (
                    <Pressable
                      onPress={() => { onConfirm(preview, true); setPreview(null); }}
                      style={{ backgroundColor: '#0a84ff', borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}
                    >
                      <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 15, color: '#fff' }}>Send image too</Text>
                    </Pressable>
                  ) : null}
                  <Pressable onPress={() => setPreview(null)} style={{ paddingVertical: 10, alignItems: 'center' }}>
                    <Text style={{ fontFamily: Fonts.sans, fontSize: 14, color: '#8e8e93' }}>Cancel</Text>
                  </Pressable>
                </View>
              </>
            ) : null}
          </View>
        </View>
      </Modal>
    </>
  );
}
