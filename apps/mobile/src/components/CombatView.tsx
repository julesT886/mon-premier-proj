import {
  ENEMIES_BY_ID,
  SKILLS_BY_ID,
  type CombatEvent,
  type CombatLog,
} from '@brumeterre/game-core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { loc } from '../i18n';
import { useLocale } from '../hooks/useT';
import { colors, font, radius, space } from '../theme';

interface Props {
  log: CombatLog;
  heroName: string;
  /** Multiplicateur de vitesse de lecture (1 = temps réel). */
  speed?: number;
  onEnd?: () => void;
}

/** Chiffres de dégâts affichés en même temps par camp (au-delà, ils déborderaient). */
const MAX_FLOATERS_PER_SIDE = 2;

interface Floater {
  id: number;
  text: string;
  color: string;
  side: 'hero' | 'enemy';
}

/** Rejoue un CombatLog : barres de vie animées et dégâts flottants. */
export function CombatView({ log, heroName, speed = 1.5, onEnd }: Props) {
  const locale = useLocale();
  const [heroHp, setHeroHp] = useState(log.hero.maxHp);
  const [enemyHp, setEnemyHp] = useState(log.enemy.maxHp);
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const [lastCast, setLastCast] = useState<string | null>(null);
  const cursor = useRef(0);
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;

  const heroBar = useSharedValue(1);
  const enemyBar = useSharedValue(1);
  const heroStyle = useAnimatedStyle(() => ({ width: `${heroBar.value * 100}%` }));
  const enemyStyle = useAnimatedStyle(() => ({ width: `${enemyBar.value * 100}%` }));

  const enemyName = useMemo(() => {
    const def = ENEMIES_BY_ID[log.enemy.enemyId];
    return def ? loc(def.name, locale) : log.enemy.enemyId;
  }, [log, locale]);

  useEffect(() => {
    let hHp = log.hero.maxHp;
    let eHp = log.enemy.maxHp;
    let elapsed = 0;
    let floaterId = 0;
    cursor.current = 0;
    setHeroHp(hHp);
    setEnemyHp(eHp);
    heroBar.value = 1;
    enemyBar.value = 1;
    setFloaters([]);
    setLastCast(null);

    const apply = (e: CombatEvent) => {
      if (e.type === 'damage') {
        if (e.actor === 'hero') eHp = Math.max(0, eHp - e.amount);
        else hHp = Math.max(0, hHp - e.amount);
        floaterId += 1;
        const f: Floater = {
          id: floaterId,
          text: `${e.crit ? '✦' : ''}${e.amount}`,
          color: e.actor === 'hero' ? colors.accent : colors.bad,
          side: e.actor === 'hero' ? 'enemy' : 'hero',
        };
        setFloaters((prev) => [...prev.slice(-4), f]);
      } else if (e.type === 'heal') {
        if (e.actor === 'hero') hHp = Math.min(log.hero.maxHp, hHp + e.amount);
        else eHp = Math.min(log.enemy.maxHp, eHp + e.amount);
      } else if (e.type === 'cast' && e.actor === 'hero') {
        const skill = SKILLS_BY_ID[e.sourceId];
        setLastCast(skill ? loc(skill.name, locale) : null);
      }
    };

    const step = 100;
    const timer = setInterval(() => {
      elapsed += step * speed;
      while (
        cursor.current < log.events.length &&
        (log.events[cursor.current]?.t ?? 0) <= elapsed
      ) {
        apply(log.events[cursor.current] as CombatEvent);
        cursor.current += 1;
      }
      setHeroHp(hHp);
      setEnemyHp(eHp);
      heroBar.value = withTiming(hHp / log.hero.maxHp, { duration: 180 });
      enemyBar.value = withTiming(eHp / log.enemy.maxHp, { duration: 180 });
      if (elapsed >= log.durationMs + 600) {
        clearInterval(timer);
        onEndRef.current?.();
      }
    }, step);
    return () => clearInterval(timer);
  }, [log, speed, locale, heroBar, enemyBar]);

  return (
    <View style={styles.wrap} testID="combat-view">
      <Fighter
        name={heroName}
        hp={heroHp}
        max={log.hero.maxHp}
        barStyle={heroStyle}
        color={colors.hpHero}
      />
      <View style={styles.middle}>
        {lastCast ? (
          <Animated.Text key={lastCast + cursor.current} entering={FadeInDown} style={styles.cast}>
            {lastCast}
          </Animated.Text>
        ) : null}
        {/* Deux colonnes bornées : dégâts reçus à gauche, infligés à droite (2 max chacune). */}
        <View style={styles.floaters} pointerEvents="none">
          {(['hero', 'enemy'] as const).map((side) => (
            <View
              key={side}
              style={[styles.column, { alignItems: side === 'hero' ? 'flex-start' : 'flex-end' }]}
            >
              {floaters
                .filter((f) => f.side === side)
                .slice(-MAX_FLOATERS_PER_SIDE)
                .map((f) => (
                  <Animated.Text
                    key={f.id}
                    entering={FadeInDown.duration(150)}
                    style={[styles.floater, { color: f.color }]}
                  >
                    {f.text}
                  </Animated.Text>
                ))}
            </View>
          ))}
        </View>
      </View>
      <Fighter
        name={enemyName}
        hp={enemyHp}
        max={log.enemy.maxHp}
        barStyle={enemyStyle}
        color={colors.hpEnemy}
      />
    </View>
  );
}

function Fighter({
  name,
  hp,
  max,
  barStyle,
  color,
}: {
  name: string;
  hp: number;
  max: number;
  barStyle: ReturnType<typeof useAnimatedStyle>;
  color: string;
}) {
  return (
    <View style={styles.fighter}>
      <View style={styles.fighterHeader}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.hp}>
          {Math.round(hp)}/{max}
        </Text>
      </View>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, { backgroundColor: color }, barStyle]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fighter: { gap: space.xs },
  fighterHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  name: { color: colors.text, fontSize: font.md, fontWeight: '600', flexShrink: 1 },
  hp: { color: colors.textDim, fontSize: font.sm, fontVariant: ['tabular-nums'] },
  track: { height: 12, borderRadius: 999, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  fill: { height: 12 },
  middle: { height: 64, justifyContent: 'center', overflow: 'hidden' },
  cast: { color: colors.textDim, fontSize: font.sm, textAlign: 'center', fontStyle: 'italic' },
  floaters: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  column: { justifyContent: 'center', minWidth: 64 },
  floater: { fontSize: font.md, fontWeight: '800', lineHeight: 22 },
});
