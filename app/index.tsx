import { Redirect } from 'expo-router';
import { Platform } from 'react-native';

// `unstable_settings.anchor` in _layout.tsx is not enough on its own to make
// simple-chat the true landing screen — it only anchors it underneath the
// stack (which is why Android's back button was revealing it). An explicit
// index route is the reliable way to control what loads first.
export default function Index() {
  // Keep the native landing route unchanged while making the deployed web app
  // use the shorter public URL.
  return <Redirect href={Platform.OS === 'web' ? '/chat' : '/simple-chat'} />;
}
