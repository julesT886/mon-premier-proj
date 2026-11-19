import { ENEMIES_BY_ID, REGIONS, REGIONS_BY_ID } from '@brumeterre/game-core';
import { StyleSheet, Text, View } from 'react-native';
import { Bar, Button, Card, Label, Row, Screen, Title } from '../../components/ui';
import { useT } from '../../hooks/useT';
import { loc } from '../../i18n';
import { useGame, useGameState } from '../../store/game';
import { colors, font, regionColors } from '../../theme';

const GLYPH = { forest: '🌲', volcano: '🌋', coast: '🌊' } as const;

export default function MapScreen() {
  const t = useT();
  const state = useGameState();
  const travel = useGame((s) => s.travel);

  return (
    <Screen>
      <Title>{t('map.title')}</Title>
      {REGIONS.map((region) => {
        const progress = state.regions[region.id];
        const here = state.activeRegion === region.id;
        const boss = ENEMIES_BY_ID[region.boss];
        const ratio = progress.bossDefeated
          ? 1
          : Math.min(1, progress.killsSinceBossAttempt / region.bossKillThreshold);
        return (
          <Card
            key={region.id}
            style={[
              { borderLeftWidth: 4, borderLeftColor: regionColors[region.id] },
              !progress.unlocked && { opacity: 0.5 },
            ]}
          >
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={styles.name}>
                {GLYPH[region.id]} {loc(region.name, 'fr')}
              </Text>
              <Text style={styles.levels}>
                {t('map.levels', { min: region.minLevel, max: region.bossLevel })}
              </Text>
            </Row>
            <Label dim style={{ fontSize: 13 }}>
              {loc(region.mood, 'fr')}
            </Label>
            {progress.unlocked ? (
              <View style={{ gap: 6 }}>
                <Label style={{ fontSize: 13 }}>
                  {t('map.boss', { name: boss ? loc(boss.name, 'fr') : region.boss })}{' '}
                  {progress.bossDefeated ? '✓' : ''}
                </Label>
                <Bar value={ratio} color={regionColors[region.id]} height={6} />
                {here ? (
                  <Label style={{ color: colors.accent }}>{t('map.here')}</Label>
                ) : (
                  <Button
                    label={t('map.travel')}
                    kind="secondary"
                    onPress={() => travel(region.id)}
                    testID={`travel-${region.id}`}
                  />
                )}
              </View>
            ) : (
              <Label dim>
                🔒{' '}
                {t('map.locked', {
                  region: region.unlockedBy ? loc(REGIONS_BY_ID[region.unlockedBy].name, 'fr') : '',
                })}
              </Label>
            )}
          </Card>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  name: { color: colors.text, fontSize: font.lg, fontWeight: '800' },
  levels: { color: colors.textDim, fontSize: font.sm },
});
