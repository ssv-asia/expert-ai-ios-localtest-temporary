// Handles every lifecycle event Android sends for any of this app's widgets
// (added to home screen, periodic update, resized, clicked, removed). This
// runs as a HEADLESS task — a separate JS execution with no React tree or
// navigation mounted — which is why each branch re-derives its data itself
// from storage rather than reading any in-memory app state.
import React from 'react';
import * as Linking from 'expo-linking';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { DailyNoteWidget } from './DailyNoteWidget';
import { TasksWidget } from './TasksWidget';
import { WeekStreakWidget, type DayMark } from './WeekStreakWidget';
import { QuickChatWidget } from './QuickChatWidget';
import { listDailyNotes, computeStreak, localDayKey } from '../lib/daily-notes';
import { loadStoredTasks, type ScheduledTask } from '../features/scheduled-tasks/store';

async function getStreak(): Promise<number> {
  try {
    return computeStreak(await listDailyNotes());
  } catch {
    return 0;
  }
}

async function getWeekDays(): Promise<DayMark[]> {
  try {
    const notes = await listDailyNotes();
    const touchedKeys = new Set(notes.filter((n) => n.touched).map((n) => n.id));
    const todayKey = localDayKey();
    const labels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    const days: DayMark[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = localDayKey(d);
      days.push({ label: labels[d.getDay()], touched: touchedKeys.has(key), isToday: key === todayKey });
    }
    return days;
  } catch {
    return [];
  }
}

const RENDERERS: Record<string, (props: WidgetTaskHandlerProps) => Promise<React.JSX.Element>> = {
  DailyNoteWidget: async () => <DailyNoteWidget streak={await getStreak()} />,
  TasksWidget: async () => {
    let tasks: ScheduledTask[] = [];
    try {
      tasks = (await loadStoredTasks())
        .filter((t) => t.status === 'pending')
        .sort((a, b) => a.scheduledFor - b.scheduledFor);
    } catch {
      // Storage may not be initialized in a headless worker. Render an empty,
      // valid widget instead of rejecting the entire background task.
      tasks = [];
    }
    return <TasksWidget tasks={tasks} />;
  },
  WeekStreakWidget: async () => {
    const [days, streak] = await Promise.all([getWeekDays(), getStreak()]);
    return <WeekStreakWidget days={days} streak={streak} />;
  },
  QuickChatWidget: async () => {
    let deepLinkUri: string | undefined;
    try {
      deepLinkUri = Linking.createURL('simple-chat', { queryParams: { widgetAction: 'new-chat' } });
    } catch {
      deepLinkUri = undefined; // falls back to plain OPEN_APP
    }
    return <QuickChatWidget deepLinkUri={deepLinkUri} />;
  },
};

export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  const render = RENDERERS[props.widgetInfo.widgetName];
  if (!render) return;

  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED':
    case 'WIDGET_CLICK':
      props.renderWidget(await render(props));
      break;
    case 'WIDGET_DELETED':
      // Nothing to clean up — none of these widgets hold state of their own.
      break;
    default:
      break;
  }
}
