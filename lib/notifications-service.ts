import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Curated "by the way" notifications — rotated through the month at a calm cadence.
// Kept broad on purpose: Expert AI is a general research/reasoning assistant, not only
// an AEC tool. A handful of architecture/construction prompts remain (that vault is a
// real differentiator), but most speak to everyday research, writing, learning,
// planning and quick-fact use so the rotation never feels repetitive or niche.
const NOTIFICATION_MESSAGES = [
  // --- Research & fact-checking ---
  { title: 'Check it before you send it', body: 'Paste a claim or a stat into Expert AI and get it verified with sources.' },
  { title: 'Go deeper in a minute', body: 'Ask Expert AI to summarise both sides of any topic you are weighing up.' },
  { title: 'One good question', body: 'Not sure where to start? Describe what you are trying to learn and let Expert AI map it out.' },
  { title: 'Second opinion, on tap', body: 'Run your reasoning past Expert AI before you commit to a decision.' },
  { title: 'Look it up properly', body: 'Expert AI can search the web, cite what it finds, and skip the guesswork.' },

  // --- Writing & communication ---
  { title: 'Tighten that draft', body: 'Drop an email or a paragraph into Expert AI and ask for a clearer version.' },
  { title: 'Say it in half the words', body: 'Expert AI can trim a long message down without losing the point.' },
  { title: 'Stuck on the opening line?', body: 'Tell Expert AI what you want to say and let it get you started.' },
  { title: 'Match the tone', body: 'Ask Expert AI to rewrite something formal, friendly, or straight to the point.' },
  { title: 'Reply, sorted', body: 'Forward the gist of a tricky message and Expert AI will draft a reply you can edit.' },

  // --- Learning & explaining ---
  { title: 'Explain it like I have five minutes', body: 'Any concept, any field — Expert AI can pitch it at whatever level you need.' },
  { title: 'Learn something today', body: 'Ask Expert AI to teach you one useful idea from a field you know nothing about.' },
  { title: 'Break down the jargon', body: 'Paste a dense paragraph and ask Expert AI what it actually means.' },
  { title: 'From zero', body: 'Starting a new subject? Ask Expert AI for a beginner roadmap and the first three steps.' },
  { title: 'Test your understanding', body: 'Explain something to Expert AI and let it point out what you missed.' },

  // --- Planning & productivity ---
  { title: 'Turn the mess into a plan', body: 'List everything on your mind and ask Expert AI to sort it into next actions.' },
  { title: 'Think it through', body: 'Describe a decision you are facing and let Expert AI lay out the trade-offs.' },
  { title: 'Draft the agenda', body: 'Tell Expert AI the goal of your meeting and get a tight agenda back.' },
  { title: 'Plan the week', body: 'Give Expert AI your priorities and constraints, get a realistic schedule.' },
  { title: 'Break the big task down', body: 'Ask Expert AI to split a daunting project into small, doable pieces.' },

  // --- Quick facts & everyday help ---
  { title: 'Quick answer', body: 'Conversions, calculations, timezones, definitions — Expert AI handles the small stuff fast.' },
  { title: 'Settle the question', body: 'Have a quick factual thing to check? Expert AI can look it up and cite it.' },
  { title: 'Weather, currency, time', body: 'Expert AI has live tools for the practical questions that come up mid-task.' },
  { title: 'Name that thing', body: 'Describe what you are trying to remember and Expert AI will help you find the word.' },
  { title: 'Two minutes, one insight', body: 'Ask Expert AI for one non-obvious fact about whatever you are working on.' },

  // --- Architecture / engineering / construction (the specialist vault) ---
  { title: 'Codes and standards, cited', body: 'Ask Expert AI about a building code clause and get the exact wording, not a paraphrase.' },
  { title: 'Design question?', body: 'Structural, materials, services, sustainability — Expert AI draws on a curated AEC vault.' },
  { title: 'Check the requirement', body: 'Expert AI can quote NBC and other standards verbatim, with the source.' },
  { title: 'Spec it right', body: 'Ask Expert AI about materials, methods, or detailing for your next project.' },
  { title: 'Planning a build', body: 'Expert AI can walk you through compliance, sequencing, and technical detail.' },

  // --- Gentle re-engagement ---
  { title: 'Anything on your mind?', body: 'Expert AI is one tap away whenever a question comes up.' },
  { title: 'Pick up where you left off', body: 'Your past conversations are still here in Expert AI.' },
  { title: 'Got a minute?', body: 'Ask Expert AI the thing you have been meaning to look up.' },
  { title: 'Here when you need it', body: 'Research, writing, planning, quick facts — Expert AI is ready when you are.' },
  { title: 'Make the next hour easier', body: 'Tell Expert AI what you are about to do and ask how to do it faster.' },
];

// System notification triggers (for agent mode, simple chat, tasks)
export interface SystemNotification {
  type: 'agent_ready' | 'task_completed' | 'task_failed' | 'high_complexity_query' | 'response_ready';
  title: string;
  body: string;
  data?: Record<string, string>;
}

let cachedPushToken: string | null | undefined;

export class NotificationsService {
  /** Subscribe to taps on a system notification so callers can reconcile or
   * route immediately, including when the app was already in memory. */
  static addResponseListener(listener: (data: Record<string, unknown>) => void) {
    if (Platform.OS === 'web') return null;
    return Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      listener(data && typeof data === 'object' ? data as Record<string, unknown> : {});
    });
  }

  /** Read a notification tap that launched the app from a cold start. */
  static async getLastResponseData(): Promise<Record<string, unknown> | null> {
    if (Platform.OS === 'web') return null;
    try {
      const response = await Notifications.getLastNotificationResponseAsync();
      const data = response?.notification.request.content.data;
      return data && typeof data === 'object' ? data as Record<string, unknown> : null;
    } catch {
      return null;
    }
  }

  static async init() {
    if (Platform.OS === 'web') return;

    // Request notification permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.warn('[Notifications] Permission denied');
      return;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('responses', {
        name: 'Responses',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
        vibrationPattern: [0, 150, 100, 150],
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      }).catch((err) => console.warn('[Notifications] Failed to configure response channel:', err));
    }

    // Configure notification behavior
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        // Added in a later expo-notifications major version — granular control
        // over the two Android presentation surfaces (heads-up banner vs. the
        // notification shade's list entry). Both true matches this app's prior
        // "just show it" behavior under the old shouldShowAlert-only API.
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    Notifications.addPushTokenListener((event) => {
      cachedPushToken = event.data || null;
    });
  }

  /** Returns the Expo push token when this native build can provide one. */
  static async getPushToken(): Promise<string | undefined> {
    if (Platform.OS === 'web') return undefined;
    if (cachedPushToken !== undefined) return cachedPushToken || undefined;
    try {
      const projectId = Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId;
      if (!projectId || (await Notifications.getPermissionsAsync()).status !== 'granted') {
        cachedPushToken = null;
        return undefined;
      }
      const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      cachedPushToken = token || null;
      return token || undefined;
    } catch (err) {
      cachedPushToken = null;
      console.warn('[Notifications] Failed to obtain push token:', err);
      return undefined;
    }
  }

  // Schedule rotating by-the-way notifications at a 20-minute cadence
  static async scheduleByTheWayNotifications(enabled: boolean = true) {
    if (Platform.OS === 'web') return;

    // Remove only this feature's scheduled tips. A global cancel would also
    // delete response-ready and task-completion notifications that are the
    // delivery guarantee for durable background jobs.
    const scheduled = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
    await Promise.all(scheduled
      .filter((item) => item.content.data && (item.content.data as Record<string, unknown>).kind === 'by_the_way')
      .map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier).catch(() => {})));

    if (!enabled) return;

    // Schedule notifications every 20 minutes for the next 30 days
    const intervalMinutes = 20;
    const maxNotifications = Math.floor((30 * 24 * 60) / intervalMinutes);

    for (let i = 0; i < Math.min(maxNotifications, NOTIFICATION_MESSAGES.length * 6); i++) {
      const message = NOTIFICATION_MESSAGES[i % NOTIFICATION_MESSAGES.length];
      const triggerSeconds = intervalMinutes * 60 * i + 60; // Start 1 min from now

      try {
        await Notifications.scheduleNotificationAsync({
          content: {
          title: message.title,
          body: message.body,
          sound: 'default',
          channelId: 'responses',
          badge: 1,
          data: { kind: 'by_the_way' },
          } as Notifications.NotificationContentInput,
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
            seconds: triggerSeconds,
          },
        });
      } catch (err) {
        console.warn('[Notifications] Failed to schedule notification:', err);
      }
    }
  }

  // Send immediate system notification (e.g., task completed, agent ready)
  static async sendSystemNotification(notification: SystemNotification) {
    if (Platform.OS === 'web') return;

    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: notification.title,
          body: notification.body,
          sound: 'default',
          channelId: 'responses',
          badge: 1,
          data: notification.data || {},
        } as Notifications.NotificationContentInput,
        trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 1 },
      });
    } catch (err) {
      console.warn('[Notifications] Failed to send system notification:', err);
    }
  }

  // System notification helpers
  static notifyTaskCompleted(taskName: string) {
    return this.sendSystemNotification({
      type: 'task_completed',
      title: 'Task completed',
      body: `"${taskName}" has finished running.`,
    });
  }

  static notifyTaskFailed(taskName: string, reason?: string) {
    return this.sendSystemNotification({
      type: 'task_failed',
      title: 'Task failed',
      body: `"${taskName}" encountered an error${reason ? `: ${reason}` : ''}.`,
    });
  }

  static notifyAgentReady(workspaceName: string) {
    return this.sendSystemNotification({
      type: 'agent_ready',
      title: 'Agent ready',
      body: `Your agent in "${workspaceName}" is ready to chat.`,
    });
  }

  static notifyComplexQuery() {
    return this.sendSystemNotification({
      type: 'high_complexity_query',
      title: 'Processing complex query',
      body: 'This might take a bit longer - we\'re working on it.',
    });
  }

  static notifyResponseReady() {
    return this.sendSystemNotification({
      type: 'response_ready',
      title: 'Response ready',
      body: 'Tap to see the full answer.',
    });
  }

  // ---- Scheduled tasks -----------------------------------------------------
  // Legacy/local fallback for scheduled tasks. Durable tasks created through
  // simple-chat are executed by the gateway and use its completion push; this
  // reminder remains available when the gateway cannot accept a job.
  static async scheduleTaskReminder(
    taskId: string,
    prompt: string,
    whenMs: number,
  ): Promise<string | null> {
    if (Platform.OS === 'web') return null;
    const when = new Date(whenMs);
    if (when.getTime() <= Date.now() + 5000) return null; // too soon / in the past
    try {
      return await Notifications.scheduleNotificationAsync({
        content: {
          title: '⏰ Scheduled task is due',
          body: prompt.length > 90 ? `${prompt.slice(0, 90)}…` : prompt,
          sound: 'default',
          data: { kind: 'scheduled_task', taskId },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when },
      });
    } catch (err) {
      console.warn('[Notifications] Failed to schedule task reminder:', err);
      return null;
    }
  }

  static async cancelScheduled(notificationId: string | null | undefined) {
    if (!notificationId || Platform.OS === 'web') return;
    try {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
    } catch {
      /* already fired or cancelled */
    }
  }

  // Get a random by-the-way message (for testing)
  static getRandomMessage() {
    return NOTIFICATION_MESSAGES[Math.floor(Math.random() * NOTIFICATION_MESSAGES.length)];
  }

  // Get all messages (for debugging/admin)
  static getAllMessages() {
    return NOTIFICATION_MESSAGES;
  }
}
