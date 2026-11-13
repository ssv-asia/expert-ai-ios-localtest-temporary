"use no memo";

// Home-screen widget: today's daily-note streak, tap to open the app. Kept
// deliberately minimal for a first widget — a bigger surface (today's note
// text, quick-add) is a natural follow-up once this one is confirmed working
// on a real device (widgets can't be verified any other way; Metro/typecheck
// can't render an actual AppWidgetHostView).
import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';

export function DailyNoteWidget({ streak }: { streak: number }) {
  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{
        height: 'match_parent',
        width: 'match_parent',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#3D1A66',
        borderRadius: 16,
      }}
    >
      <TextWidget
        text={streak > 0 ? `🔥 ${streak}-day streak` : 'Start a daily note'}
        style={{ fontSize: 16, fontWeight: 'bold', color: '#FFFFFF' }}
      />
      <TextWidget
        text="Open Expert AI"
        style={{ fontSize: 12, color: '#D8C7EE', marginTop: 4 }}
      />
    </FlexWidget>
  );
}
