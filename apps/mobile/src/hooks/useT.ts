import { useCallback } from 'react';
import { translate, type MessageKey } from '../i18n';
import { useGame } from '../store/game';

export function useLocale() {
  return useGame((s) => s.save?.settings.locale ?? 'fr');
}

export function useT() {
  const locale = useLocale();
  return useCallback(
    (key: MessageKey, params?: Record<string, string | number>) => translate(locale, key, params),
    [locale],
  );
}
