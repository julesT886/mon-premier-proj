import * as Notifications from 'expo-notifications';

/** Rappel local quand le plafond hors ligne est atteint (iOS/Android). */
export async function enableNotifications(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

export async function scheduleCapReminder(capMs: number, title: string, body: string) {
  await Notifications.cancelAllScheduledNotificationsAsync();
  await Notifications.scheduleNotificationAsync({
    content: { title, body },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: Math.max(60, Math.round(capMs / 1000)),
    },
  });
}

export async function cancelReminders() {
  await Notifications.cancelAllScheduledNotificationsAsync();
}
