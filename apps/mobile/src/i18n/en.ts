import type { MessageKey } from './fr';

/** Traduction partielle : les clés absentes retombent sur le français. */
export const en: Partial<Record<MessageKey, string>> = {
  'tabs.home': 'Home',
  'tabs.build': 'Build',
  'tabs.map': 'Map',
  'tabs.journal': 'Journal',
  'tabs.settings': 'Settings',
  'common.continue': 'Continue',
  'common.back': 'Back',
  'common.close': 'Close',
  'common.level': 'Lv. {level}',
  'home.collect': 'Collect',
  'home.whyLost': 'Why did I lose?',
  'build.coach': 'Ask the coach',
  'coach.test': 'Test suggestion',
  'coach.apply': 'Apply',
  'settings.language': 'Language',
  'settings.tone': 'Story tone',
};
