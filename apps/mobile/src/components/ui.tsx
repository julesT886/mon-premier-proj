import type { Tag } from '@brumeterre/game-core';
import type { ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useT } from '../hooks/useT';
import { colors, font, radius, space, tagColors } from '../theme';

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.content}>{children}</ScrollView>
      ) : (
        <View style={[styles.content, { flex: 1 }]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Label({
  children,
  dim,
  style,
}: {
  children: ReactNode;
  dim?: boolean;
  style?: StyleProp<TextStyle>;
}) {
  return <Text style={[styles.label, dim && { color: colors.textDim }, style]}>{children}</Text>;
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

type ButtonKind = 'primary' | 'secondary' | 'ghost';

export function Button({
  label,
  onPress,
  kind = 'primary',
  disabled,
  testID,
}: {
  label: string;
  onPress: () => void;
  kind?: ButtonKind;
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        kind === 'primary' && { backgroundColor: colors.accent },
        kind === 'secondary' && {
          backgroundColor: colors.surfaceAlt,
          borderColor: colors.border,
          borderWidth: 1,
        },
        kind === 'ghost' && { backgroundColor: 'transparent' },
        (pressed || disabled) && { opacity: disabled ? 0.4 : 0.75 },
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          kind === 'primary' ? { color: colors.accentText } : { color: colors.text },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function TagChip({ tag, active = true }: { tag: Tag; active?: boolean }) {
  const t = useT();
  return (
    <View
      style={[
        styles.chip,
        {
          borderColor: tagColors[tag],
          backgroundColor: active ? `${tagColors[tag]}33` : 'transparent',
        },
      ]}
    >
      <Text style={[styles.chipText, { color: tagColors[tag] }]}>{t(`tag.${tag}`)}</Text>
    </View>
  );
}

export function Bar({
  value,
  color,
  height = 10,
}: {
  value: number;
  color: string;
  height?: number;
}) {
  return (
    <View style={[styles.barTrack, { height }]}>
      <View
        style={{
          width: `${Math.max(0, Math.min(1, value)) * 100}%`,
          backgroundColor: color,
          height,
        }}
      />
    </View>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, gap: space.md, paddingBottom: space.xl * 2 },
  title: { color: colors.text, fontSize: font.xl, fontWeight: '700' },
  label: { color: colors.text, fontSize: font.md, lineHeight: 21 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: space.lg,
    gap: space.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  button: {
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  buttonText: { fontSize: font.md, fontWeight: '700' },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: space.sm, paddingVertical: 2 },
  chipText: { fontSize: 12, fontWeight: '600' },
  barTrack: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 999,
    overflow: 'hidden',
    width: '100%',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
});
