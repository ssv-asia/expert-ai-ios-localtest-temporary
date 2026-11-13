// On-device image analysis — Google ML Kit text recognition (OCR) and image
// labeling, both run entirely on the phone via Google Play Services. No image
// bytes ever leave the device for this path: the model only receives whatever
// text/labels were extracted locally. This is what lets free/community-tier
// users get real value from a photo without needing a vision-capable model or
// an upload at all.
import TextRecognition from '@react-native-ml-kit/text-recognition';
import ImageLabeling from '@react-native-ml-kit/image-labeling';

export interface ImageAnalysisResult {
  /** OCR'd text, empty string if none found or recognition failed. */
  text: string;
  /** Human-readable object/scene labels, e.g. "Laptop", "Whiteboard". */
  labels: string[];
}

/** Runs OCR + labeling locally. Never throws — a failed pass just yields an
 *  empty result so the caller can still fall back to a plain image send. */
export async function analyzeImageOnDevice(uri: string): Promise<ImageAnalysisResult> {
  const [textResult, labelResult] = await Promise.allSettled([
    TextRecognition.recognize(uri),
    ImageLabeling.label(uri),
  ]);

  const text = textResult.status === 'fulfilled' ? textResult.value.text.trim() : '';
  const labels =
    labelResult.status === 'fulfilled'
      ? labelResult.value
          .filter((l) => l.confidence >= 0.6)
          .slice(0, 8)
          .map((l) => l.text)
      : [];

  return { text, labels };
}

/** Turns an on-device analysis into a plain-text block to prepend to the
 *  user's message — this is the path every tier/model can use, since it's
 *  just text by the time it reaches the model. */
export function describeAnalysis(result: ImageAnalysisResult): string {
  const parts: string[] = [];
  if (result.labels.length) parts.push(`Image contains: ${result.labels.join(', ')}.`);
  if (result.text) parts.push(`Text found in image:\n${result.text}`);
  if (!parts.length) parts.push('(No text or recognizable objects were detected in the image.)');
  return parts.join('\n\n');
}
