import { CLASSES, type ClassId } from '@brumeterre/game-core';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Button, Card, Label, Screen, Title } from '../components/ui';
import { useT } from '../hooks/useT';
import { loc } from '../i18n';
import { useGame } from '../store/game';
import { colors, font, radius, space } from '../theme';

const INTRO = [
  { title: 'onboarding.1.title', body: 'onboarding.1.body', glyph: '🌫️' },
  { title: 'onboarding.2.title', body: 'onboarding.2.body', glyph: '⚔️' },
  { title: 'onboarding.3.title', body: 'onboarding.3.body', glyph: '🌙' },
] as const;

/** 3 écrans d'intro, puis choix de classe et de nom (≈ 30 s). */
export default function Onboarding() {
  const t = useT();
  const createHero = useGame((s) => s.createHero);
  const [step, setStep] = useState(0);
  const [classId, setClassId] = useState<ClassId>('warrior');
  const [name, setName] = useState('');

  if (step < INTRO.length) {
    const page = INTRO[step] as (typeof INTRO)[number];
    return (
      <Screen scroll={false}>
        <Animated.View key={step} entering={FadeIn.duration(400)} style={styles.intro}>
          <Text style={styles.glyph}>{page.glyph}</Text>
          <Title>{t(page.title)}</Title>
          <Label dim style={{ textAlign: 'center' }}>
            {t(page.body)}
          </Label>
        </Animated.View>
        <View style={styles.dots}>
          {INTRO.map((_, i) => (
            <View key={i} style={[styles.dot, i === step && { backgroundColor: colors.accent }]} />
          ))}
        </View>
        <Button
          label={t('common.continue')}
          onPress={() => setStep(step + 1)}
          testID="onboarding-next"
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <Title>{t('onboarding.class.title')}</Title>
      {(['warrior', 'mage'] as const).map((id) => (
        <Pressable key={id} onPress={() => setClassId(id)} testID={`class-${id}`}>
          <Card style={classId === id && { borderColor: colors.accent, borderWidth: 2 }}>
            <Text style={styles.className}>
              {id === 'warrior' ? '🛡️' : '🔥'} {loc(CLASSES[id].name, 'fr')}
            </Text>
            <Label dim>
              {t(id === 'warrior' ? 'onboarding.class.warrior' : 'onboarding.class.mage')}
            </Label>
          </Card>
        </Pressable>
      ))}
      <Label dim>{t('onboarding.dual')}</Label>
      <Label>{t('onboarding.name.label')}</Label>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder={t('onboarding.name.placeholder')}
        placeholderTextColor={colors.textDim}
        maxLength={24}
        style={styles.input}
        testID="hero-name"
      />
      <Button
        label={t('onboarding.start')}
        testID="onboarding-start"
        onPress={async () => {
          await createHero(name, classId, Date.now());
          router.replace('/tutorial');
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: space.lg },
  glyph: { fontSize: 64 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: space.sm, marginBottom: space.md },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  className: { color: colors.text, fontSize: font.lg, fontWeight: '700' },
  input: {
    backgroundColor: colors.surface,
    color: colors.text,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    fontSize: font.md,
  },
});
