/** Pas de notifications locales sur l'aperçu web. */
export async function enableNotifications(): Promise<boolean> {
  return false;
}

export async function scheduleCapReminder(_capMs: number, _title: string, _body: string) {
  // no-op
}

export async function cancelReminders() {
  // no-op
}
