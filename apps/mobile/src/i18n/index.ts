import type { Locale, Localized } from '@brumeterre/game-core';
import { en } from './en';
import { fr, type MessageKey } from './fr';

const dictionaries: Record<Locale, Partial<Record<MessageKey, string>>> = { fr, en };

export type { MessageKey };

export function translate(
  locale: Locale,
  key: MessageKey,
  params: Record<string, string | number> = {},
): string {
  const template = dictionaries[locale][key] ?? fr[key];
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`));
}

/** Libellé de contenu de jeu (compétences, régions…) dans la langue voulue. */
export function loc(text: Localized, locale: Locale): string {
  return text[locale] ?? text.fr;
}

export function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${Math.max(1, minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

const INTL: Record<Locale, string> = { fr: 'fr-FR', en: 'en-US' };

export function formatNumber(n: number, locale: Locale): string {
  return n.toLocaleString(INTL[locale]);
}

export function formatDate(ts: number, locale: Locale): string {
  return new Date(ts).toLocaleString(INTL[locale]);
}
