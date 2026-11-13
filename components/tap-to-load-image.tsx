// Low-data-mode guard for markdown images in assistant replies. A chat
// response can contain `![alt](url)` and react-native-marked's default
// image renderer fetches it immediately with no gate — for a user on a
// limited prepaid data plan (the primary target audience for this app),
// that's an unexpected data cost they didn't ask for. Require an explicit
// tap before any remote image is fetched.
import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

export function TapToLoadImage({ uri, alt }: { uri: string; alt?: string }) {
  const [loading, setLoading] = useState(false);

  if (!loading) {
    return (
      <Pressable onPress={() => setLoading(true)} style={styles.placeholder}>
        <Text style={styles.placeholderText}>🖼️ Tap to load image{alt ? ` — ${alt}` : ''}</Text>
        <Text style={styles.placeholderHint}>Not loaded automatically to save mobile data</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.loadedWrap}>
      <Image source={{ uri }} accessibilityLabel={alt} style={styles.image} resizeMode="contain" />
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(128,128,128,0.3)',
    alignItems: 'center',
    marginVertical: 4,
  },
  placeholderText: { fontSize: 13, fontWeight: '600' },
  placeholderHint: { fontSize: 11, opacity: 0.6, marginTop: 2 },
  loadedWrap: { width: '100%', marginVertical: 4 },
  image: { width: '100%', aspectRatio: 1.5, borderRadius: 8 },
});
