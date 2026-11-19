import { availableSkills } from './build';
import type { CoachAdvice } from './coach';
import type { Recap, RecapInput } from './narrative';
import type { GameState } from './state';
import type { CombatSummary } from './summary';
import type { ClassId, Locale, SkillId, SynergyId } from './types';

/**
 * Contrat réseau app ↔ API. Uniquement des identifiants et des nombres
 * (sauf le nom du héros, assaini côté serveur) : les libellés envoyés au modèle
 * sont reconstruits côté serveur depuis le contenu du jeu, ce qui ferme la porte
 * à l'injection de prompt via les données de jeu.
 */
export interface CoachRequest {
  locale: Locale;
  hero: { classId: ClassId; level: number };
  build: (SkillId | null)[];
  availableSkills: SkillId[];
  summary: {
    outcome: 'win' | 'loss';
    endReason: 'enemyDefeated' | 'heroDefeated' | 'timeout';
    durationS: number;
    heroHpLeftPct: number;
    enemy: { id: string; level: number; hpLeftPct: number };
    slots: { skillId: SkillId | null; casts: number; damage: number; damageSharePct: number }[];
    topDamage: { sourceId: string; damage: number; sharePct: number }[];
    deathCauses: { sourceId: string; damage: number; sharePct: number }[];
    idlePct: number;
    unusedSkills: SkillId[];
    activeSynergies: SynergyId[];
    nearlyActiveSynergies: SynergyId[];
    healingDone: number;
    shieldAbsorbed: number;
  };
}

export interface CoachResponse {
  advice: CoachAdvice;
  source: 'ai' | 'cache';
  promptVersion: string;
  remaining: number;
}

export interface RecapRequest extends RecapInput {
  locale: Locale;
}

export interface RecapResponse {
  recap: Recap;
  promptVersion: string;
  remaining: number;
}

export function toCoachRequest(
  state: GameState,
  summary: CombatSummary,
  locale: Locale = 'fr',
): CoachRequest {
  return {
    locale,
    hero: { classId: state.hero.classId, level: state.hero.level },
    build: [...state.build.slots],
    availableSkills: availableSkills(state.hero.classId, state.hero.level).map((s) => s.id),
    summary: {
      outcome: summary.outcome,
      endReason: summary.endReason,
      durationS: summary.durationS,
      heroHpLeftPct: summary.hero.hpLeftPct,
      enemy: {
        id: summary.enemy.id,
        level: summary.enemy.level,
        hpLeftPct: summary.enemy.hpLeftPct,
      },
      slots: summary.slots.map((s) => ({
        skillId: s.skillId,
        casts: s.casts,
        damage: s.damage,
        damageSharePct: s.damageSharePct,
      })),
      topDamage: summary.topDamage.map(({ sourceId, damage, sharePct }) => ({
        sourceId,
        damage,
        sharePct,
      })),
      deathCauses: summary.deathCauses.map(({ sourceId, damage, sharePct }) => ({
        sourceId,
        damage,
        sharePct,
      })),
      idlePct: summary.idlePct,
      unusedSkills: [...summary.unusedSkills],
      activeSynergies: summary.synergies.active.map((s) => s.id),
      nearlyActiveSynergies: summary.synergies.nearlyActive.map((s) => s.id),
      healingDone: summary.defense.healingDone,
      shieldAbsorbed: summary.defense.shieldAbsorbed,
    },
  };
}
