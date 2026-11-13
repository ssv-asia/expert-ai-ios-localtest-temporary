"use no memo";

// Home-screen widget: up to 3 soonest pending scheduled tasks. Genuinely
// useful daily surface — "what did I schedule and when" without opening the
// app, which is exactly what a widget should be for.
import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import type { ScheduledTask } from '../features/scheduled-tasks/store';

function formatWhen(ms: number): string {
  const d = new Date(ms);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return isToday ? time : `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${time}`;
}

export function TasksWidget({ tasks }: { tasks: ScheduledTask[] }) {
  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        padding: 12,
        backgroundColor: '#1C1C1E',
        borderRadius: 16,
      }}
    >
      <TextWidget text="Scheduled tasks" style={{ fontSize: 13, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 6 }} />
      {tasks.length === 0 ? (
        <TextWidget text="Nothing scheduled" style={{ fontSize: 12, color: '#9A9A9E' }} />
      ) : (
        tasks.slice(0, 3).map((t) => (
          <FlexWidget key={t.id} style={{ flexDirection: 'row', marginBottom: 4 }}>
            <TextWidget
              text={formatWhen(t.scheduledFor)}
              style={{ fontSize: 11, color: '#8E8EF0', width: 64 }}
            />
            <FlexWidget style={{ flex: 1 }}>
              <TextWidget
                text={t.prompt}
                truncate="END"
                maxLines={1}
                style={{ fontSize: 12, color: '#E5E5EA' }}
              />
            </FlexWidget>
          </FlexWidget>
        ))
      )}
    </FlexWidget>
  );
}
