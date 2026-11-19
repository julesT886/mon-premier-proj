import { offlineCapMs, RECAP_TONES, type Locale, type RecapTone } from '@brumeterre/game-core';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text } from 'react-native';
import { Button, Card, Label, Row, Screen, Title } from '../../components/ui';
import { useT } from '../../hooks/useT';
import { enableNotifications } from '../../lib/notifications';
import { useGame, useGameState, useSettings } from '../../store/game';
import { colors, font, space } from '../../theme';

const LOCALES: { id: Locale; label: string }[] = [
  { id: 'fr', label: 'Français' },
  { id: 'en', label: 'English' },
];

export default function SettingsScreen() {
  const t = useT();
  const state = useGameState();
  const settings = useSettings();
  const update = useGame((s) => s.updateSettings);
  const reset = useGame((s) => s.reset);
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <Screen>
      <Title>{t('settings.title')}</Title>

      <Card>
        <Label dim>{t('settings.language')}</Label>
        <Row>
          {LOCALES.map((l) => (
            <Choice
              key={l.id}
              label={l.label}
              active={settings.locale === l.id}
              onPress={() => update({ locale: l.id })}
            />
          ))}
        </Row>
      </Card>

      <Card>
        <Label dim>{t('settings.tone')}</Label>
        <Row>
          {RECAP_TONES.map((tone: RecapTone) => (
            <Choice
              key={tone}
              label={t(`settings.tone.${tone}`)}
              active={settings.tone === tone}
              onPress={() => update({ tone })}
            />
          ))}
        </Row>
      </Card>

      <Card>
        <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
          <Label style={{ flex: 1 }}>{t('settings.notifications')}</Label>
          <Switch
            value={settings.notifications}
            onValueChange={async (on) => {
              const granted = on ? await enableNotifications() : false;
              update({ notifications: on && granted });
            }}
            trackColor={{ true: colors.accent, false: colors.border }}
          />
        </Row>
        <Label dim>
          {t('settings.offlineCap', { hours: offlineCapMs(state.entitlements) / 3_600_000 })}
        </Label>
      </Card>

      <Card>
        <Label dim>{t('settings.shop')}</Label>
        <Label style={{ fontSize: 13 }}>{t('settings.shopHint')}</Label>
      </Card>

      <Button
        kind="ghost"
        label={confirmReset ? t('settings.resetConfirm') : t('settings.reset')}
        onPress={async () => {
          if (!confirmReset) return setConfirmReset(true);
          await reset();
          router.replace('/onboarding');
        }}
      />
    </Screen>
  );
}

function Choice({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.choice, active && styles.choiceOn]}
      accessibilityRole="button"
    >
      <Text style={[styles.choiceText, active && { color: colors.accentText }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  choice: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  choiceOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  choiceText: { color: colors.text, fontSize: font.sm, fontWeight: '600' },
});
