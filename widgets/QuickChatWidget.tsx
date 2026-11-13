"use no memo";

// Home-screen widget: a single large tap target that jumps straight into a
// brand-new chat — not just "open the app" (which would resume whatever
// conversation was last open). `deepLinkUri` is built by the task handler via
// expo-linking's Linking.createURL, so it always matches this build's actual
// registered scheme instead of a guessed/hardcoded one; simple-chat.tsx reads
// the `widgetAction` param and calls handleNewChat().
import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';

export function QuickChatWidget({ deepLinkUri }: { deepLinkUri?: string }) {
  return (
    <FlexWidget
      clickAction={deepLinkUri ? 'OPEN_URI' : 'OPEN_APP'}
      clickActionData={deepLinkUri ? { uri: deepLinkUri } : undefined}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#3D1A66',
        borderRadius: 16,
      }}
    >
      <TextWidget text="💬" style={{ fontSize: 22 }} />
      <TextWidget text="Ask Expert AI" style={{ fontSize: 13, fontWeight: 'bold', color: '#FFFFFF', marginTop: 4 }} />
    </FlexWidget>
  );
}
