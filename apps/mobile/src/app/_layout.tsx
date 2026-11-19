import { offlineCapMs } from '@brumeterre/game-core';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { translate } from '../i18n';
import { cancelReminders, scheduleCapReminder } from '../lib/notifications';
import { useGame } from '../store/game';
import { colors } from '../theme';

/** Progression en ligne : une tranche de simulation toutes les 5 min, vérifiée toutes les 15 s. */
const TICK_INTERVAL_MS = 15_000;

export default function RootLayout() {
  const init = useGame((s) => s.init);

  useEffect(() => {
    void init(Date.now());
    const interval = setInterval(() => useGame.getState().tick(Date.now()), TICK_INTERVAL_MS);
    const sub = AppState.addEventListener('change', (status) => {
      const { save, resume, tick } = useGame.getState();
      if (!save) return;
      if (status === 'active') {
        void cancelReminders().catch(() => undefined);
        resume(Date.now());
      } else if (status === 'background') {
        tick(Date.now());
        if (save.settings.notifications) {
          const l = save.settings.locale;
          void scheduleCapReminder(
            offlineCapMs(save.state.entitlements),
            translate(l, 'notif.title'),
            translate(l, 'notif.body'),
          ).catch(() => undefined);
        }
      }
    });
    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [init]);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="tutorial" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="recap" options={{ presentation: 'modal' }} />
        <Stack.Screen name="coach" options={{ presentation: 'modal' }} />
      </Stack>
    </SafeAreaProvider>
  );
}
