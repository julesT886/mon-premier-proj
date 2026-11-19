import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useGame } from '../store/game';
import { colors } from '../theme';

export default function Index() {
  const ready = useGame((s) => s.ready);
  const hasSave = useGame((s) => s.save !== null);
  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  return <Redirect href={hasSave ? '/home' : '/onboarding'} />;
}
