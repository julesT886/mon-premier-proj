import {
  ALL_TAGS,
  BUILD_SLOTS,
  MAX_SKILL_RANK,
  SKILLS,
  SKILLS_BY_ID,
  SYNERGIES,
  evaluateSynergies,
  isSkillAvailable,
  setSlot,
  skillUpgradeCost,
  swapSlots,
  type SkillDef,
  type Tag,
} from '@brumeterre/game-core';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Label, Row, Screen, TagChip, Title } from '../../components/ui';
import { useLocale, useT } from '../../hooks/useT';
import { formatNumber, loc } from '../../i18n';
import { useGame, useGameState } from '../../store/game';
import { colors, font, radius, space, tagColors } from '../../theme';

export default function BuildScreen() {
  const t = useT();
  const locale = useLocale();
  const state = useGameState();
  const setBuild = useGame((s) => s.setBuild);
  const upgrade = useGame((s) => s.upgrade);
  const [selectedSlot, setSelectedSlot] = useState(0);
  const [filter, setFilter] = useState<Tag | null>(null);

  const synergies = useMemo(() => evaluateSynergies(state.build), [state.build]);
  const skills = useMemo(
    () =>
      SKILLS.filter((s) => !filter || s.tags.includes(filter)).sort(
        (a, b) =>
          Number(isSkillAvailable(b, state.hero.classId, state.hero.level)) -
            Number(isSkillAvailable(a, state.hero.classId, state.hero.level)) ||
          Number(b.classId === state.hero.classId) - Number(a.classId === state.hero.classId) ||
          a.requiredLevel - b.requiredLevel,
      ),
    [filter, state.hero.classId, state.hero.level],
  );

  const place = (skill: SkillDef) => setBuild(setSlot(state.build, selectedSlot, skill.id));

  return (
    <Screen>
      <Title>{t('build.title')}</Title>
      <Label dim>{t('build.hint')}</Label>

      {Array.from({ length: BUILD_SLOTS }, (_, i) => {
        const id = state.build.slots[i] ?? null;
        const skill = id ? SKILLS_BY_ID[id] : undefined;
        const selected = selectedSlot === i;
        return (
          <Pressable key={i} onPress={() => setSelectedSlot(i)} testID={`slot-${i}`}>
            <View style={[styles.slot, selected && { borderColor: colors.accent, borderWidth: 2 }]}>
              <Text style={styles.slotIndex}>{i + 1}</Text>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.slotName}>
                  {skill ? loc(skill.name, locale) : t('build.empty')}
                </Text>
                {skill ? (
                  <Row>
                    {skill.tags.map((tag) => (
                      <TagChip key={tag} tag={tag} />
                    ))}
                    <Text style={styles.rank}>
                      {t('build.rank', { rank: state.skillRanks[skill.id] ?? 1 })}
                    </Text>
                  </Row>
                ) : null}
              </View>
              {selected && skill ? (
                <View style={styles.slotActions}>
                  {i > 0 ? (
                    <Mini
                      label="↑"
                      onPress={() => {
                        setBuild(swapSlots(state.build, i, i - 1));
                        setSelectedSlot(i - 1);
                      }}
                    />
                  ) : null}
                  {i < BUILD_SLOTS - 1 ? (
                    <Mini
                      label="↓"
                      onPress={() => {
                        setBuild(swapSlots(state.build, i, i + 1));
                        setSelectedSlot(i + 1);
                      }}
                    />
                  ) : null}
                  <Mini label="✕" onPress={() => setBuild(setSlot(state.build, i, null))} />
                </View>
              ) : null}
            </View>
          </Pressable>
        );
      })}

      <Card>
        <Label dim>{t('build.synergies')}</Label>
        <Row>
          {synergies
            .filter((s) => s.active || s.missing === 1)
            .map((s) => {
              const def = SYNERGIES.find((d) => d.id === s.id);
              return (
                <View
                  key={s.id}
                  style={[styles.synergy, s.active ? styles.synergyOn : styles.synergyNear]}
                >
                  <Text
                    style={[
                      styles.synergyText,
                      { color: s.active ? colors.accentText : colors.textDim },
                    ]}
                  >
                    {def ? loc(def.name, locale) : s.id}
                    {s.active ? '' : ` · ${t('build.synergy.missing', { n: s.missing })}`}
                  </Text>
                </View>
              );
            })}
        </Row>
        {synergies
          .filter((s) => s.active)
          .map((s) => {
            const def = SYNERGIES.find((d) => d.id === s.id);
            return def ? (
              <Label key={s.id} dim style={{ fontSize: 13 }}>
                ✓ {loc(def.description, locale)}
              </Label>
            ) : null;
          })}
      </Card>

      <Button
        label={`🧭 ${t('build.coach')}`}
        onPress={() => router.push('/coach')}
        testID="open-coach"
      />

      <Label dim>{t('build.pickFor', { n: selectedSlot + 1 })}</Label>
      <Row>
        <FilterChip
          label={t('build.filter.all')}
          active={filter === null}
          onPress={() => setFilter(null)}
        />
        {ALL_TAGS.map((tag) => (
          <FilterChip
            key={tag}
            label={t(`tag.${tag}`)}
            color={tagColors[tag]}
            active={filter === tag}
            onPress={() => setFilter(filter === tag ? null : tag)}
          />
        ))}
      </Row>

      {skills.map((skill) => {
        const available = isSkillAvailable(skill, state.hero.classId, state.hero.level);
        const inBuild = state.build.slots.includes(skill.id);
        const rank = state.skillRanks[skill.id] ?? 1;
        const cost = skillUpgradeCost(rank);
        return (
          <Pressable
            key={skill.id}
            disabled={!available}
            onPress={() => place(skill)}
            testID={`skill-${skill.id}`}
          >
            <Card
              style={[!available && { opacity: 0.45 }, inBuild && { borderColor: colors.accent }]}
            >
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={styles.skillName}>
                  {skill.classId === 'warrior' ? '🛡️' : '🔥'} {loc(skill.name, locale)}
                </Text>
                <Text style={styles.cd}>
                  {available
                    ? `${skill.cooldownMs / 1000} s`
                    : t('build.locked', { level: skill.requiredLevel })}
                </Text>
              </Row>
              <Label dim style={{ fontSize: 13 }}>
                {loc(skill.description, locale)}
              </Label>
              <Row>
                {skill.tags.map((tag) => (
                  <TagChip key={tag} tag={tag} />
                ))}
              </Row>
              {available && inBuild && rank < MAX_SKILL_RANK ? (
                <Button
                  kind="secondary"
                  label={t('build.upgrade', { cost: formatNumber(cost, locale) })}
                  disabled={state.resources.gold < cost}
                  onPress={() => upgrade(skill.id)}
                />
              ) : null}
            </Card>
          </Pressable>
        );
      })}
    </Screen>
  );
}

function Mini({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.mini} accessibilityRole="button">
      <Text style={{ color: colors.text, fontSize: font.md }}>{label}</Text>
    </Pressable>
  );
}

function FilterChip({
  label,
  active,
  onPress,
  color = colors.text,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  color?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.filter, { borderColor: color }, active && { backgroundColor: `${color}33` }]}
    >
      <Text style={{ color, fontSize: font.sm, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  slot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    minHeight: 64,
  },
  slotIndex: {
    color: colors.accent,
    fontSize: font.xl,
    fontWeight: '800',
    width: 24,
    textAlign: 'center',
  },
  slotName: { color: colors.text, fontSize: font.md, fontWeight: '700' },
  rank: { color: colors.textDim, fontSize: 12 },
  slotActions: { flexDirection: 'row', gap: space.xs },
  mini: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  synergy: { borderRadius: 999, paddingHorizontal: space.md, paddingVertical: space.xs },
  synergyOn: { backgroundColor: colors.accent },
  synergyNear: { borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed' },
  synergyText: { fontSize: font.sm, fontWeight: '700' },
  filter: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  skillName: { color: colors.text, fontSize: font.md, fontWeight: '700', flexShrink: 1 },
  cd: { color: colors.textDim, fontSize: font.sm },
});
