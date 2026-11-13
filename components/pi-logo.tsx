import { Image } from 'react-native';

interface ExpertAiLogoProps {
  size?: number;
  color?: string;
}

// `color` is kept for call-site compatibility with the old SVG mark, but the new logo is a
// full-color illustration (not a tintable line mark), so it's intentionally unused here.
export function ExpertAiLogo({ size = 24 }: ExpertAiLogoProps) {
  return (
    <Image
      source={require('@/assets/images/icon.png')}
      style={{ width: size, height: size, borderRadius: size * 0.22 }}
      resizeMode="cover"
    />
  );
}
