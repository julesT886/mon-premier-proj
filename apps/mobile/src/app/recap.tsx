import type { Recap } from '@brumeterre/game-core';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Button, Card, Label, Row, Screen, Title } from '../components/ui';
import { useLocale, useT } from '../hooks/useT';
import { formatDuration, formatNumber, type MessageKey } from '../i18n';
import { fetchRecapWithFallback, recapInputFrom } from '../lib/session';
import { getApi, useGame } from '../store/game';
import { colors, font, space } from '../theme';

/** Retour du joueur : récompenses chiffrées d'abord, puis le récit en fondu. */
export default function RecapScreen() {
  const t = useT();
  const locale = useLocale();
  const pending = useGame((s) => s.pending);
  const save = useGame((s) => s.save);
  const collect = useGame((s) => s.collect);
  const [recap, setRecap] = useState<Recap | null>(null);

  useEffect(() => {
    if (!pending || !save) return;
    let alive = true;
    const input = recapInputFrom(save.state, pending.result, save.settings.tone);
    // Ne rejette jamais et ne dépasse jamais 4 s : repli local garanti.
    void fetchRecapWithFallback(getApi(), input, save.settings.locale).then((r) => {
      if (alive) setRecap(r);
    });
    return () => {
      alive = false;
    };
    // Le récit ne dépend que du résultat en attente.
  }, [pending]);

  if (!pending || !save) {
    return (
      <Screen>
        <Button label={t('common.close')} onPress={() => router.back()} />
      </Screen>
    );
  }

  const { rewards, levelsGained, creditedMs, overflowMs } = pending.result;
  const materials = (['moonsap', 'embershard', 'nacre'] as const).filter(
    (m) => rewards.resources[m] > 0,
  );

  return (
    <Screen>
      <Title>{t('recap.title')}</Title>
      <Label dim>{formatDuration(creditedMs)}</Label>

      <Animated.View entering={FadeInDown.duration(300)}>
        <Card>
          <Label dim>{t('recap.rewards')}</Label>
          <Row>
            <Reward value={`+${formatNumber(rewards.xp, locale)}`} label={t('resource.xp')} />
            <Reward
              value={`+${formatNumber(rewards.resources.gold, locale)}`}
              label={t('resource.gold')}
            />
            {materials.map((m) => (
              <Reward
                key={m}
                value={`+${rewards.resources[m]}`}
                label={t(`resource.${m}` as MessageKey)}
              />
            ))}
          </Row>
          <Label>{t('recap.kills', { n: rewards.kills })}</Label>
          {levelsGained > 0 ? (
            <Label style={{ color: colors.accent }}>{t('recap.levels', { n: levelsGained })}</Label>
          ) : null}
          {overflowMs > 0 ? (
            <Label dim>{t('recap.overflow', { time: formatDuration(overflowMs) })}</Label>
          ) : null}
        </Card>
      </Animated.View>

      <Card>
        <Label dim>{t('recap.story')}</Label>
        {recap ? (
          <Animated.View entering={FadeIn.duration(1200)} style={{ gap: space.sm }}>
            <Text style={styles.story} testID="recap-story">
              {recap.story}
            </Text>
            <Text style={styles.hook}>{recap.hook}</Text>
            <Label dim style={{ fontSize: 12 }}>
              {t(recap.source === 'ai' ? 'recap.source.ai' : 'recap.source.template')}
            </Label>
          </Animated.View>
        ) : (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.accent} />
            <Label dim>{t('recap.writing')}</Label>
          </View>
        )}
      </Card>

      <Button
        label={t('recap.collect')}
        testID="recap-collect"
        onPress={async () => {
          await collect(recap);
          router.back();
        }}
      />
    </Screen>
  );
}

function Reward({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.reward}>
      <Text style={styles.rewardValue}>{value}</Text>
      <Text style={styles.rewardLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  story: { color: colors.text, fontSize: font.md, lineHeight: 23 },
  hook: { color: colors.accent, fontSize: font.md, fontStyle: 'italic' },
  loading: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  reward: { minWidth: 72 },
  rewardValue: {
    color: colors.good,
    fontSize: font.lg,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  rewardLabel: { color: colors.textDim, fontSize: 12 },
});
