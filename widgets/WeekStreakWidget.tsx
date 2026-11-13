"use no memo";

// Home-screen widget: a lightweight "calendar" — the last 7 days as a strip,
// each day marked whether its daily note was actually touched. Gives the
// at-a-glance consistency view a calendar would, without needing full grid
// layout (Android widgets render via RemoteViews, not arbitrary views — a
// 7-cell strip is the right-sized ambition for that, a full month grid isn't).
import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';

export interface DayMark {
  label: string; // "M", "T", ...
  touched: boolean;
  isToday: boolean;
}

export function WeekStreakWidget({ days, streak }: { days: DayMark[]; streak: number }) {
  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 12,
        backgroundColor: '#0F0F1E',
        borderRadius: 16,
      }}
    >
      <TextWidget
        text={streak > 0 ? `${streak}-day streak` : 'This week'}
        style={{ fontSize: 13, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 8 }}
      />
      <FlexWidget style={{ flexDirection: 'row', flexGap: 8 }}>
        {days.map((d, i) => (
          <FlexWidget key={i} style={{ flexDirection: 'column', alignItems: 'center' }}>
            <TextWidget text={d.label} style={{ fontSize: 10, color: '#8B7BB0', marginBottom: 3 }} />
            <FlexWidget
              style={{
                width: 16,
                height: 16,
                borderRadius: 8,
                backgroundColor: d.touched ? '#7C3AED' : '#2A2540',
                borderWidth: d.isToday ? 2 : 0,
                borderColor: '#FFFFFF',
              }}
            />
          </FlexWidget>
        ))}
      </FlexWidget>
    </FlexWidget>
  );
}
