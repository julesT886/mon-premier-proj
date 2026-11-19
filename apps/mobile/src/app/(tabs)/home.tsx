import {
  CLASSES,
  REGIONS_BY_ID,
  xpToNext,
  type CombatLog,
  type Locale,
  type OfflineEvent,
  type ResourceId,
} from '@brumeterre/game-core';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';
import { CombatView } from '../../components/CombatView';
import { Bar, Button, Card, Label, Row, Screen } from '../../components/ui';
import { useLocale, useT } from '../../hooks/useT';
import { formatDuration, formatNumber, loc, type MessageKey } from '../../i18n';
import { showcaseCombat } from '../../lib/session';
import { useGame, useGameState } from '../../store/game';
import { colors, font, regionColors, space } from '../../theme';

const RESOURCES: ResourceId[] = ['gold', 'moonsap', 'embershard', 'nacre'];

export default function Home() {
  const t = useT();
  const locale = useLocale();
  const state = useGameState();
  const pending = useGame((s) => s.pending);
  const lastFight = useGame((s) => s.lastFight);
  const recentEvents = useGame((s) => s.recentEvents);
  const recordFight = useGame((s) => s.recordFight);
  const [fightIndex, setFightIndex] = useState(0);
  const [fight, setFight] = useState<CombatLog>(() => showcaseCombat(state, 0));

  const region = REGIONS_BY_ID[state.activeRegion];
  const progress = state.regions[region.id];

  // Le build ou la région changent : on relance un combat représentatif.
  useEffect(() => {
    setFight(showcaseCombat(state, fightIndex));
  }, [state.build, state.activeRegion, state.hero.level]);

  const onFightEnd = useCallback(() => {
    recordFight(fight);
    const next = fightIndex + 1;
    setFightIndex(next);
    setFight(showcaseCombat(useGame.getState().save?.state ?? state, next));
  }, [fight, fightIndex, recordFight, state]);

  const xpNeeded = xpToNext(state.hero.level);

  return (
    <Screen>
      {pending ? (
        <Animated.View entering={FadeInDown}>
          <Card style={{ borderColor: colors.accent, borderWidth: 2 }}>
            <Label>{t('home.away', { time: formatDuration(pending.result.creditedMs) })}</Label>
            <Button
              label={t('home.collect')}
              onPress={() => router.push('/recap')}
              testID="collect"
            />
          </Card>
        </Animated.View>
      ) : null}

      <Row style={{ justifyContent: 'space-between' }}>
        <View>
          <Text style={styles.hero}>{state.hero.name}</Text>
          <Label dim>
            {t('common.level', { level: state.hero.level })} ·{' '}
            {loc(CLASSES[state.hero.classId].name, locale)}
          </Label>
        </View>
        <View style={[styles.regionBadge, { borderColor: regionColors[region.id] }]}>
          <Text style={[styles.regionText, { color: regionColors[region.id] }]}>
            {loc(region.name, locale)}
          </Text>
        </View>
      </Row>
      <Bar
        value={xpNeeded === Infinity ? 1 : state.hero.xp / xpNeeded}
        color={colors.accent}
        height={6}
      />

      <Row>
        {RESOURCES.filter((r) => r === 'gold' || state.resources[r] > 0).map((r) => (
          <View key={r} style={styles.resource}>
            <Text style={styles.resourceValue}>{formatNumber(state.resources[r], locale)}</Text>
            <Text style={styles.resourceLabel}>{t(`resource.${r}` as MessageKey)}</Text>
          </View>
        ))}
      </Row>

      <Label dim>{t('home.fighting')}</Label>
      {pending ? null : (
        <CombatView key={fightIndex} log={fight} heroName={state.hero.name} onEnd={onFightEnd} />
      )}

      <Card>
        <Label>
          {progress.bossDefeated
            ? t('home.bossDefeated')
            : t('home.bossProgress', {
                kills: Math.min(progress.killsSinceBossAttempt, region.bossKillThreshold),
                threshold: region.bossKillThreshold,
              })}
        </Label>
        {lastFight && lastFight.outcome === 'loss' ? (
          <Button
            label={t('home.whyLost')}
            kind="secondary"
            onPress={() => router.push('/coach?from=loss')}
          />
        ) : null}
      </Card>

      {recentEvents.length > 0 ? (
        <Card>
          {recentEvents.slice(-3).map((e, i) => (
            <Animated.Text
              key={`${e.ts}-${i}`}
              entering={FadeInDown}
              exiting={FadeOut}
              style={styles.event}
            >
              {eventLabel(e, t, locale)}
            </Animated.Text>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}

function eventLabel(e: OfflineEvent, t: ReturnType<typeof useT>, locale: Locale): string {
  switch (e.type) {
    case 'level_up':
      return t('event.level_up', { level: e.level });
    case 'region_unlocked':
      return t('event.region_unlocked', { region: loc(REGIONS_BY_ID[e.region].name, locale) });
    case 'merchant':
    case 'treasure':
      return t(`event.${e.type}`, { gold: formatNumber(e.gold, locale) });
    default:
      return t(`event.${e.type}`);
  }
}

const styles = StyleSheet.create({
  hero: { color: colors.text, fontSize: font.xl, fontWeight: '800' },
  regionBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  regionText: { fontWeight: '700' },
  resource: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  resourceValue: { color: colors.text, fontWeight: '700', fontVariant: ['tabular-nums'] },
  resourceLabel: { color: colors.textDim, fontSize: 11 },
  event: { color: colors.text, fontSize: font.md },
});
