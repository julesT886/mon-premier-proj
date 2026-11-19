import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { Card, Label, Row, Screen, Title } from '../../components/ui';
import { useT } from '../../hooks/useT';
import { formatDuration } from '../../i18n';
import { storage } from '../../lib/storage';
import type { JournalCombat, JournalRecap } from '../../lib/storage.types';
import { colors, font } from '../../theme';

export default function JournalScreen() {
  const t = useT();
  const [combats, setCombats] = useState<JournalCombat[]>([]);
  const [recaps, setRecaps] = useState<JournalRecap[]>([]);

  useFocusEffect(
    useCallback(() => {
      void storage.listCombats(10).then(setCombats);
      void storage.listRecaps(10).then(setRecaps);
    }, []),
  );

  return (
    <Screen>
      <Title>{t('journal.title')}</Title>

      <Label dim>{t('journal.recaps')}</Label>
      {recaps.length === 0 ? <Label dim>{t('journal.empty')}</Label> : null}
      {recaps.map((r) => (
        <Card key={r.ts}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={styles.meta}>{new Date(r.ts).toLocaleString('fr-FR')}</Text>
            <Text style={styles.meta}>
              {formatDuration(r.elapsedMs)} · {r.kills} ⚔️ · +{r.gold} or
            </Text>
          </Row>
          <Label>{r.recap.story}</Label>
          <Label style={{ color: colors.accent, fontStyle: 'italic' }}>{r.recap.hook}</Label>
        </Card>
      ))}

      <Label dim>{t('journal.combats')}</Label>
      {combats.length === 0 ? <Label dim>{t('journal.empty')}</Label> : null}
      {combats.map((c, i) => (
        <Card key={`${c.ts}-${i}`}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text
              style={[
                styles.outcome,
                { color: c.summary.outcome === 'win' ? colors.good : colors.bad },
              ]}
            >
              {c.summary.outcome === 'win' ? '✓' : '✗'} {c.summary.enemy.name} (niv.{' '}
              {c.summary.enemy.level})
            </Text>
            <Text style={styles.meta}>{c.summary.durationS} s</Text>
          </Row>
          <Label dim style={{ fontSize: 13 }}>
            {c.summary.topDamage.map((d) => `${d.name} ${d.sharePct} %`).join(' · ')}
          </Label>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  meta: { color: colors.textDim, fontSize: 12 },
  outcome: { fontSize: font.md, fontWeight: '700', flexShrink: 1 },
});
