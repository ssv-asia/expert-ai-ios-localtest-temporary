import { Redirect, useLocalSearchParams } from 'expo-router';

export default function NativeChatSessionRedirect() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  if (!sessionId) return <Redirect href="/agent-chat" />;
  return <Redirect href={{ pathname: '/agent-chat/[sessionId]', params: { sessionId } }} />;
}
