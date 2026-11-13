import { Platform } from 'react-native';
import { Redirect } from 'expo-router';
import SimpleChatScreen from '../../simple-chat';

// Legacy deep links stay valid, but Android only opens the dedicated Agent Chat.
export default function ChatIndexScreen() {
  if (Platform.OS === 'web') return <SimpleChatScreen />;
  return <Redirect href="/agent-chat" />;
}
