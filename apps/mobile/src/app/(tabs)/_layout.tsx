import { Redirect, Tabs } from 'expo-router';
import { Text, View } from 'react-native';
import { useT } from '../../hooks/useT';
import { useGame } from '../../store/game';
import { colors } from '../../theme';

const icon = (glyph: string) =>
  function TabIcon({ focused }: { focused: boolean }) {
    return <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>{glyph}</Text>;
  };

export default function TabsLayout() {
  const t = useT();
  const ready = useGame((s) => s.ready);
  const hasSave = useGame((s) => s.save !== null);
  // Attendre le chargement de la sauvegarde avant toute redirection (ouverture directe d'un onglet).
  if (!ready) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  if (!hasSave) return <Redirect href="/onboarding" />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textDim,
      }}
    >
      <Tabs.Screen name="home" options={{ title: t('tabs.home'), tabBarIcon: icon('🏕️') }} />
      <Tabs.Screen name="build" options={{ title: t('tabs.build'), tabBarIcon: icon('📜') }} />
      <Tabs.Screen name="map" options={{ title: t('tabs.map'), tabBarIcon: icon('🗺️') }} />
      <Tabs.Screen name="journal" options={{ title: t('tabs.journal'), tabBarIcon: icon('📖') }} />
      <Tabs.Screen
        name="settings"
        options={{ title: t('tabs.settings'), tabBarIcon: icon('⚙️') }}
      />
    </Tabs>
  );
}
