import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Étend app.json. EXPO_BASE_URL (ex. « /mon-premier-proj ») sert la version web sous un
 * sous-chemin, comme sur GitHub Pages. Absent en local : l'app reste servie à la racine.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const baseUrl = process.env.EXPO_BASE_URL;
  return {
    ...(config as ExpoConfig),
    ...(baseUrl ? { experiments: { ...config.experiments, baseUrl } } : {}),
  };
};
