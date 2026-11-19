import {
  availableSkills,
  evaluateBuild,
  heroSnapshot,
  makeEnemy,
  setSlot,
  simulateCombat,
  type BuildEvaluation,
  type GameState,
  type SkillId,
} from '@brumeterre/game-core';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { CombatView } from '../components/CombatView';
import { Button, Card, Label, Row, Screen, TagChip, Title } from '../components/ui';
import { useT } from '../hooks/useT';
import { loc } from '../i18n';
import { useGame } from '../store/game';
import { colors, font, space } from '../theme';

/** Niveau offert à la fin du premier combat : débloque de vrais choix pour le slot 4. */
export const TUTORIAL_LEVEL = 4;
const TUTORIAL_ENEMY = { id: 'bramble_ox', level: 4 } as const;

/**
 * Tutoriel interactif (≈ 90 s) :
 * 1. regarder un combat ; 2. remplir le slot 4 ; 3. voir le gain mesuré ; 4. partir.
 */
export default function Tutorial() {
  const t = useT();
  const save = useGame((s) => s.save);
  const setBuild = useGame((s) => s.setBuild);
  const [step, setStep] = useState(1);
  const [picked, setPicked] = useState<SkillId | null>(null);

  // Le héros de tutoriel est porté au niveau TUTORIAL_LEVEL (souvenirs qui reviennent).
  const state: GameState | null = useMemo(() => {
    if (!save) return null;
    return {
      ...save.state,
      hero: { ...save.state.hero, level: Math.max(TUTORIAL_LEVEL, save.state.hero.level) },
    };
  }, [save]);

  const enemy = makeEnemy(TUTORIAL_ENEMY.id, TUTORIAL_ENEMY.level);
  const firstFight = useMemo(
    () => (state ? simulateCombat(heroSnapshot(state), enemy, 'tutorial-1') : null),
    [state?.playerSeed],
  );

  const choices = useMemo(() => {
    if (!state) return [];
    const inBuild = new Set(state.build.slots);
    return availableSkills(state.hero.classId, state.hero.level).filter((s) => !inBuild.has(s.id));
  }, [state]);

  const comparison = useMemo(() => {
    if (!state || !picked) return null;
    const target = {
      kind: 'enemy' as const,
      enemyId: TUTORIAL_ENEMY.id,
      level: TUTORIAL_ENEMY.level,
    };
    const after = setSlot(state.build, 3, picked);
    return {
      before: evaluateBuild(state, state.build, target),
      after: evaluateBuild(state, after, target),
      build: after,
    };
  }, [state, picked]);

  if (!state || !firstFight) return null;

  const finish = () => {
    const s = useGame.getState().save;
    if (s && comparison) {
      useGame.setState({
        save: {
          ...s,
          state: { ...s.state, hero: { ...s.state.hero, level: TUTORIAL_LEVEL, xp: 0 } },
        },
      });
      setBuild(comparison.build);
    }
    router.replace('/home');
  };

  return (
    <Screen>
      <Title>Tutoriel · {step}/4</Title>
      {step === 1 && (
        <Animated.View entering={FadeIn} style={styles.block}>
          <Label>{t('tutorial.step1')}</Label>
          <CombatView log={firstFight} heroName={state.hero.name} speed={2} />
          <Button label={t('common.continue')} onPress={() => setStep(2)} testID="tutorial-next" />
        </Animated.View>
      )}
      {step === 2 && (
        <Animated.View entering={FadeIn} style={styles.block}>
          <Label>{t('tutorial.step2')}</Label>
          {choices.map((skill) => (
            <Pressable
              key={skill.id}
              testID={`tutorial-skill-${skill.id}`}
              onPress={() => {
                setPicked(skill.id);
                setStep(3);
              }}
            >
              <Card>
                <Text style={styles.skillName}>{loc(skill.name, 'fr')}</Text>
                <Label dim>{loc(skill.description, 'fr')}</Label>
                <Row>
                  {skill.tags.map((tag) => (
                    <TagChip key={tag} tag={tag} />
                  ))}
                </Row>
              </Card>
            </Pressable>
          ))}
        </Animated.View>
      )}
      {step === 3 && comparison && (
        <Animated.View entering={FadeIn} style={styles.block}>
          <Label>{t('tutorial.step3')}</Label>
          <Card>
            <Compare label={t('tutorial.before')} e={comparison.before} />
            <Compare label={t('tutorial.after')} e={comparison.after} highlight />
          </Card>
          {comparison.after.avgDps > comparison.before.avgDps * 1.02 ? (
            <>
              <Label style={{ color: colors.good }}>{t('tutorial.gain')}</Label>
              <Button
                label={t('common.continue')}
                onPress={() => setStep(4)}
                testID="tutorial-next"
              />
            </>
          ) : (
            <>
              <Label dim>{t('tutorial.noGain')}</Label>
              <Button
                label={t('tutorial.retry')}
                kind="secondary"
                onPress={() => setStep(2)}
                testID="tutorial-retry"
              />
              <Button
                label={t('common.continue')}
                kind="ghost"
                onPress={() => setStep(4)}
                testID="tutorial-next"
              />
            </>
          )}
        </Animated.View>
      )}
      {step === 4 && (
        <Animated.View entering={FadeIn} style={styles.block}>
          <Text style={styles.big}>🌙</Text>
          <Label>{t('tutorial.step4')}</Label>
          <Button label={t('tutorial.finish')} onPress={finish} testID="tutorial-finish" />
        </Animated.View>
      )}
    </Screen>
  );
}

function Compare({
  label,
  e,
  highlight,
}: {
  label: string;
  e: BuildEvaluation;
  highlight?: boolean;
}) {
  return (
    <View style={styles.compare}>
      <Text style={[styles.compareLabel, highlight && { color: colors.accent }]}>{label}</Text>
      <Text style={styles.compareValue}>{Math.round(e.winRate * 100)} % victoires</Text>
      <Text style={styles.compareValue}>{(e.avgDurationMs / 1000).toFixed(1)} s</Text>
      <Text style={styles.compareValue}>{Math.round(e.avgDps)} DPS</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.md },
  skillName: { color: colors.text, fontSize: font.lg, fontWeight: '700' },
  big: { fontSize: 56, textAlign: 'center' },
  compare: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  compareLabel: { color: colors.text, fontWeight: '700', width: 60 },
  compareValue: { color: colors.text, fontVariant: ['tabular-nums'] },
});
