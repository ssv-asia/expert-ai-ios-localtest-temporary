// Image attach flow for chat: pick a photo (camera or gallery), always run
// on-device ML Kit analysis first (free, private, works for every tier/model),
// and separately offer sending the raw image itself for tiers whose model is
// vision-capable. Nothing here ever uploads a raw image unless the user picks
// the "Send image" option explicitly — the default path only ever sends text.
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import type { ChatContentPart } from './gateway-client';
import { analyzeImageOnDevice, describeAnalysis, type ImageAnalysisResult } from './image-analysis';

export interface PickedImage {
  uri: string;
  analysis: ImageAnalysisResult;
}

async function requestPermission(useCamera: boolean): Promise<boolean> {
  const result = useCamera
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  return result.granted;
}

/** Opens the camera or gallery, returns the picked image plus its on-device
 *  analysis, or null if the user cancelled or permission was denied. */
export async function pickAndAnalyzeImage(useCamera: boolean): Promise<PickedImage | null> {
  const granted = await requestPermission(useCamera);
  if (!granted) return null;

  const result = useCamera
    ? await ImagePicker.launchCameraAsync({ quality: 0.8, allowsEditing: false })
    : await ImagePicker.launchImageLibraryAsync({ quality: 0.8, allowsEditing: false });

  if (result.canceled || !result.assets?.[0]) return null;
  const uri = result.assets[0].uri;

  const analysis = await analyzeImageOnDevice(uri);
  return { uri, analysis };
}

/** The default, always-available path: fold the on-device analysis into plain
 *  text prepended to the user's message. Works with every model/tier since by
 *  the time it reaches the gateway it's just text. */
export function buildTextOnlyMessage(picked: PickedImage, userText: string): string {
  const description = describeAnalysis(picked.analysis);
  return userText ? `${description}\n\n${userText}` : description;
}

/** The opt-in path for vision-capable models: downsizes the image (keeps the
 *  request small/fast) and returns it as a base64 data: URI content part,
 *  alongside the user's text. Caller decides whether to offer this based on
 *  the signed-in tier. */
export async function buildImageContentParts(
  picked: PickedImage,
  userText: string,
): Promise<ChatContentPart[]> {
  const resized = await ImageManipulator.manipulateAsync(
    picked.uri,
    [{ resize: { width: 1024 } }],
    { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true },
  );
  const parts: ChatContentPart[] = [];
  if (userText) parts.push({ type: 'text', text: userText });
  if (resized.base64) {
    parts.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${resized.base64}` } });
  }
  return parts;
}
