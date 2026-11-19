import {
  ENEMIES_BY_ID,
  SKILLS_BY_ID,
  verifySuggestions,
  type CoachSuggestion,
  type CombatLog,
  type VerifiedSuggestion,
} from '@brumeterre/game-core';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Button, Card, Label, Row, Screen, Title } from '../components/ui';
import { useLocale, useT } from '../hooks/useT';
import { loc, type MessageKey } from '../i18n';
import {
  coachTarget,
  fetchCoachWithFallback,
  referenceCombat,
  type CoachOutcome,
} from '../lib/session';
import { getApi, useGame, useGameState } from '../store/game';
import { colors, font, space } from '../theme';

/**
 * « Pourquoi j'ai perdu ? » → explication → « Tester la suggestion » (20 combats
 * simulés localement, gain réel mesuré) → « Appliquer ».
 */
export default function CoachScreen() {
  const t = useT();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const state = useGameState();
  const lastFight = useGame((s) => s.lastFight);
  const locale = useLocale();

  const log: CombatLog = useMemo(
    () => (from === 'loss' && lastFight ? lastFight : referenceCombat(state, Date.now() % 1000)),
    // Le combat analysé est figé à l'ouverture de l'écran.
    [],
  );
  const [outcome, setOutcome] = useState<CoachOutcome | null>(null);

  useEffect(() => {
    let alive = true;
    void fetchCoachWithFallback(getApi(), state, log, locale).then((o) => {
      if (alive) setOutcome(o);
    });
    return () => {
      alive = false;
    };
  }, [log]);

  const enemy = ENEMIES_BY_ID[log.enemy.enemyId];

  return (
    <Screen>
      <Title>{t('coach.title')}</Title>
      <Label dim>
        {enemy ? loc(enemy.name, locale) : log.enemy.enemyId} ·{' '}
        {log.outcome === 'win'
          ? t('home.lastFight.win', { s: (log.durationMs / 1000).toFixed(1) })
          : t('home.lastFight.loss')}
      </Label>

      {!outcome ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.accent} />
          <Label dim>{t('coach.analyzing')}</Label>
        </View>
      ) : (
        <Animated.View entering={FadeIn} style={{ gap: space.md }}>
          <Card>
            <Text
              style={[
                styles.verdict,
                { color: outcome.advice.verdict === 'win' ? colors.good : colors.bad },
              ]}
            >
              {outcome.advice.verdict === 'win' ? '✓' : '✗'} {outcome.advice.explanation}
            </Text>
            <Label dim style={{ fontSize: 12 }}>
              {t(`coach.source.${outcome.source}` as MessageKey)}
            </Label>
          </Card>

          {outcome.advice.problems.length > 0 ? (
            <Card>
              <Label dim>{t('coach.problems')}</Label>
              {outcome.advice.problems.map((p, i) => (
                <Label key={i}>• {p.detail}</Label>
              ))}
            </Card>
          ) : null}

          <Label dim>{t('coach.suggestions')}</Label>
          {outcome.advice.suggestions.length === 0 ? <Label>{t('coach.none')}</Label> : null}
          {outcome.advice.suggestions.map((s, i) => (
            <SuggestionCard key={`${s.changeSlot}-${s.to}-${i}`} suggestion={s} log={log} />
          ))}
        </Animated.View>
      )}

      <Button label={t('common.close')} kind="ghost" onPress={() => router.back()} />
    </Screen>
  );
}

function SuggestionCard({ suggestion, log }: { suggestion: CoachSuggestion; log: CombatLog }) {
  const t = useT();
  const locale = useLocale();
  const state = useGameState();
  const setBuild = useGame((s) => s.setBuild);
  const [testing, setTesting] = useState(false);
  const [verified, setVerified] = useState<VerifiedSuggestion | null>(null);
  const [applied, setApplied] = useState(false);

  const fromSkill = suggestion.from ? SKILLS_BY_ID[suggestion.from] : undefined;
  const toSkill = SKILLS_BY_ID[suggestion.to];

  const test = () => {
    setTesting(true);
    // Laisse l'UI afficher l'indicateur avant le calcul (20 combats).
    setTimeout(() => {
      const [v] = verifySuggestions(state, [suggestion], coachTarget(state, log));
      setVerified(v ?? null);
      setTesting(false);
    }, 30);
  };

  const c = verified?.comparison;
  return (
    <Card>
      <Text style={styles.swap}>
        {t('build.slot', { n: suggestion.changeSlot + 1 })} :{' '}
        {fromSkill ? loc(fromSkill.name, locale) : t('build.empty')} →{' '}
        <Text style={{ color: colors.accent }}>
          {toSkill ? loc(toSkill.name, locale) : suggestion.to}
        </Text>
      </Text>
      {suggestion.expectedImpact ? <Label dim>{suggestion.expectedImpact}</Label> : null}

      {!verified ? (
        <Button
          label={testing ? t('coach.testing') : t('coach.test')}
          kind="secondary"
          disabled={testing}
          onPress={test}
          testID="coach-test"
        />
      ) : null}

      {c ? (
        <Animated.View entering={FadeInDown} style={{ gap: space.sm }}>
          <Label dim>{t('coach.measured')}</Label>
          <Row style={{ justifyContent: 'space-between' }}>
            <Metric
              label={t('coach.winRate')}
              before={`${Math.round(c.before.winRate * 100)} %`}
              after={`${Math.round(c.after.winRate * 100)} %`}
              good={c.winRateDelta >= 0}
            />
            <Metric
              label={t('coach.dps')}
              before={`${Math.round(c.before.avgDps)}`}
              after={`${Math.round(c.after.avgDps)}`}
              good={c.dpsDeltaPct >= 0}
            />
            <Metric
              label={t('coach.duration')}
              before={`${(c.before.avgDurationMs / 1000).toFixed(1)} s`}
              after={`${(c.after.avgDurationMs / 1000).toFixed(1)} s`}
              good={c.durationDeltaPct <= 0}
            />
          </Row>
          {!c.valid ? <Label style={{ color: colors.bad }}>{t('coach.invalid')}</Label> : null}
          {c.valid && !c.improved ? <Label dim>{t('coach.notBetter')}</Label> : null}
          <Button
            label={applied ? t('coach.applied') : t('coach.apply')}
            disabled={applied || !c.valid}
            kind={c.improved ? 'primary' : 'secondary'}
            testID="coach-apply"
            onPress={() => {
              if (verified && setBuild(verified.build)) setApplied(true);
            }}
          />
        </Animated.View>
      ) : null}
    </Card>
  );
}

function Metric({
  label,
  before,
  after,
  good,
}: {
  label: string;
  before: string;
  after: string;
  good: boolean;
}) {
  return (
    <View style={{ alignItems: 'center', minWidth: 80 }}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricBefore}>{before}</Text>
      <Text style={[styles.metricAfter, { color: good ? colors.good : colors.bad }]}>{after}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { flexDirection: 'row', gap: space.sm, alignItems: 'center', paddingVertical: space.lg },
  verdict: { fontSize: font.md, lineHeight: 22, fontWeight: '600' },
  swap: { color: colors.text, fontSize: font.md, fontWeight: '700' },
  metricLabel: { color: colors.textDim, fontSize: 12 },
  metricBefore: {
    color: colors.textDim,
    textDecorationLine: 'line-through',
    fontVariant: ['tabular-nums'],
  },
  metricAfter: { fontSize: font.lg, fontWeight: '800', fontVariant: ['tabular-nums'] },
});
