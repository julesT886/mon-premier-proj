import { availableSkills, setSlot } from './build';
import { compareBuilds, type BuildComparison, type EvalTarget } from './evaluate';
import type { GameState } from './state';
import type { CombatSummary } from './summary';
import { BUILD_SLOTS, type Build, type SkillId } from './types';
import { SKILLS_BY_ID } from './content/skills';

// ---------------------------------------------------------------------------
// Contrat partagé avec l'API IA (/ai/coach) et coach local (fallback sans réseau)
// ---------------------------------------------------------------------------

export type CoachProblemType =
  | 'low_damage'
  | 'died_to'
  | 'idle_time'
  | 'unused_skill'
  | 'resisted_school'
  | 'missing_synergy'
  | 'low_survivability';

export interface CoachProblem {
  type: CoachProblemType;
  detail: string;
}

export interface CoachSuggestion {
  changeSlot: number;
  from: SkillId | null;
  to: SkillId;
  expectedImpact: string;
}

export interface CoachAdvice {
  verdict: 'win' | 'loss';
  explanation: string;
  problems: CoachProblem[];
  suggestions: CoachSuggestion[];
}

/** Applique une suggestion à un build (ordre des autres slots inchangé). */
export function applySuggestion(
  build: Build,
  s: Pick<CoachSuggestion, 'changeSlot' | 'to'>,
): Build {
  return setSlot(build, s.changeSlot, s.to);
}

export interface VerifiedSuggestion {
  suggestion: CoachSuggestion;
  build: Build;
  comparison: BuildComparison;
}

/** Vérifie chaque suggestion par simulation : le gain affiché est mesuré, pas promis. */
export function verifySuggestions(
  state: GameState,
  suggestions: readonly CoachSuggestion[],
  target: EvalTarget,
  runs?: number,
): VerifiedSuggestion[] {
  return suggestions
    .filter((s) => s.changeSlot >= 0 && s.changeSlot < BUILD_SLOTS && SKILLS_BY_ID[s.to])
    .map((suggestion) => {
      const build = applySuggestion(state.build, suggestion);
      return {
        suggestion,
        build,
        comparison: compareBuilds(state, state.build, build, target, runs),
      };
    });
}

// ---------------------------------------------------------------------------
// Diagnostic local (sans IA)
// ---------------------------------------------------------------------------

export function diagnose(summary: CombatSummary): CoachProblem[] {
  const problems: CoachProblem[] = [];
  const top = summary.deathCauses[0];
  if (summary.endReason === 'timeout') {
    problems.push({
      type: 'low_damage',
      detail: `Temps écoulé : il restait ${summary.enemy.hpLeftPct} % de PV à ${summary.enemy.name}.`,
    });
  }
  if (summary.endReason === 'heroDefeated' && top) {
    problems.push({
      type: 'died_to',
      detail: `${top.name} a causé ${top.sharePct} % des dégâts subis.`,
    });
  }
  if (summary.idlePct >= 25) {
    problems.push({
      type: 'idle_time',
      detail: `Aucune compétence prête pendant ${summary.idlePct} % du combat.`,
    });
  }
  for (const id of summary.unusedSkills) {
    const slot = summary.slots.find((s) => s.skillId === id);
    problems.push({ type: 'unused_skill', detail: `${slot?.name ?? id} n'a jamais été lancée.` });
  }
  const resisted = Object.entries(summary.enemy.resistances).filter(([, v]) => (v ?? 0) >= 0.3);
  for (const [school, value] of resisted) {
    const hit = summary.slots.filter((s) => {
      const skill = s.skillId ? SKILLS_BY_ID[s.skillId] : undefined;
      return skill?.effects.some((e) => 'school' in e && e.school === school);
    });
    if (hit.length > 0) {
      problems.push({
        type: 'resisted_school',
        detail: `${summary.enemy.name} résiste à ${Math.round((value ?? 0) * 100)} % aux dégâts ${schoolFr(school)} (${hit.map((h) => h.name).join(', ')}).`,
      });
    }
  }
  for (const syn of summary.synergies.nearlyActive.slice(0, 2)) {
    problems.push({
      type: 'missing_synergy',
      detail: `Il manque 1 compétence pour activer ${syn.name}.`,
    });
  }
  if (
    summary.outcome === 'loss' &&
    summary.defense.healingDone + summary.defense.shieldAbsorbed === 0
  ) {
    problems.push({ type: 'low_survivability', detail: 'Aucun soin ni bouclier dans le build.' });
  }
  return problems;
}

function schoolFr(school: string): string {
  return (
    { physical: 'physiques', fire: 'de feu', ice: 'de glace', arcane: 'arcaniques' }[school] ??
    school
  );
}

/**
 * Recherche exhaustive des meilleurs remplacements d'un slot, mesurés par le moteur.
 * Criblage rapide (screenRuns) puis confirmation sur `runs` combats.
 */
export function findBestSwaps(
  state: GameState,
  target: EvalTarget,
  options: { max?: number; screenRuns?: number; runs?: number } = {},
): VerifiedSuggestion[] {
  const { max = 3, screenRuns = 6, runs = 20 } = options;
  const inBuild = new Set(state.build.slots.filter(Boolean));
  const pool = availableSkills(state.hero.classId, state.hero.level).filter(
    (s) => !inBuild.has(s.id),
  );
  const screened: { slot: number; to: SkillId; score: number }[] = [];
  for (let slot = 0; slot < BUILD_SLOTS; slot++) {
    for (const skill of pool) {
      const build = setSlot(state.build, slot, skill.id);
      const cmp = compareBuilds(state, state.build, build, target, screenRuns);
      const score = cmp.winRateDelta * 10 + cmp.dpsDeltaPct;
      if (score > 0) screened.push({ slot, to: skill.id, score });
    }
  }
  screened.sort((a, b) => b.score - a.score || a.slot - b.slot || (a.to < b.to ? -1 : 1));
  const confirmed: VerifiedSuggestion[] = [];
  const usedSlots = new Set<number>();
  const usedSkills = new Set<SkillId>();
  for (const cand of screened) {
    if (confirmed.length >= max) break;
    if (usedSlots.has(cand.slot) || usedSkills.has(cand.to)) continue;
    const suggestion: CoachSuggestion = {
      changeSlot: cand.slot,
      from: state.build.slots[cand.slot] ?? null,
      to: cand.to,
      expectedImpact: '',
    };
    const [verified] = verifySuggestions(state, [suggestion], target, runs);
    if (verified?.comparison.improved) {
      verified.suggestion.expectedImpact = formatImpact(verified.comparison);
      confirmed.push(verified);
      usedSlots.add(cand.slot);
      usedSkills.add(cand.to);
    }
  }
  return confirmed;
}

export function formatImpact(c: BuildComparison): string {
  const wr = Math.round(c.winRateDelta * 100);
  const dps = Math.round(c.dpsDeltaPct * 100);
  const parts: string[] = [];
  if (wr !== 0) parts.push(`${wr > 0 ? '+' : ''}${wr} pts de victoires`);
  if (dps !== 0) parts.push(`${dps > 0 ? '+' : ''}${dps} % de DPS`);
  return parts.length ? parts.join(', ') : 'impact négligeable';
}

/** Conseil complet sans IA : diagnostic + meilleurs remplacements mesurés. */
export function localCoach(
  state: GameState,
  summary: CombatSummary,
  target: EvalTarget,
): { advice: CoachAdvice; verified: VerifiedSuggestion[] } {
  const problems = diagnose(summary);
  const verified = findBestSwaps(state, target, { max: 2 });
  const main = problems[0];
  const explanation =
    summary.outcome === 'win'
      ? `Victoire en ${summary.durationS} s. ${verified.length ? 'Un ajustement peut encore accélérer tes combats.' : 'Ton build est solide ici.'}`
      : `Défaite contre ${summary.enemy.name}. ${main ? main.detail : ''}`.trim();
  return {
    advice: {
      verdict: summary.outcome,
      explanation,
      problems: problems.slice(0, 4),
      suggestions: verified.map((v) => v.suggestion),
    },
    verified,
  };
}
