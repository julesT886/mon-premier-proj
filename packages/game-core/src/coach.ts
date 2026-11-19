import { availableSkills, setSlot } from './build';
import { compareBuilds, type BuildComparison, type EvalTarget } from './evaluate';
import type { GameState } from './state';
import type { CombatSummary } from './summary';
import { BUILD_SLOTS, type Build, type Locale, type SkillId } from './types';
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

interface CoachTexts {
  timeout: (hpLeftPct: number, enemy: string) => string;
  diedTo: (source: string, sharePct: number) => string;
  idle: (idlePct: number) => string;
  unused: (skill: string) => string;
  resisted: (enemy: string, pct: number, school: string, skills: string) => string;
  synergy: (name: string) => string;
  noDefense: string;
  school: Record<string, string>;
  winRatePts: (n: string) => string;
  dpsPct: (n: string) => string;
  negligible: string;
  win: (durationS: number, canImprove: boolean) => string;
  loss: (enemy: string) => string;
}

const COACH_TEXTS: Record<Locale, CoachTexts> = {
  fr: {
    timeout: (hp, enemy) => `Temps écoulé : il restait ${hp} % de PV à ${enemy}.`,
    diedTo: (source, pct) => `${source} a causé ${pct} % des dégâts subis.`,
    idle: (pct) => `Aucune compétence prête pendant ${pct} % du combat.`,
    unused: (skill) => `${skill} n'a jamais été lancée.`,
    resisted: (enemy, pct, school, skills) =>
      `${enemy} résiste à ${pct} % aux dégâts ${school} (${skills}).`,
    synergy: (name) => `Il manque 1 compétence pour activer ${name}.`,
    noDefense: 'Aucun soin ni bouclier dans le build.',
    school: { physical: 'physiques', fire: 'de feu', ice: 'de glace', arcane: 'arcaniques' },
    winRatePts: (n) => `${n} pts de victoires`,
    dpsPct: (n) => `${n} % de DPS`,
    negligible: 'impact négligeable',
    win: (s, canImprove) =>
      `Victoire en ${s} s. ${canImprove ? 'Un ajustement peut encore accélérer tes combats.' : 'Ton build est solide ici.'}`,
    loss: (enemy) => `Défaite contre ${enemy}.`,
  },
  en: {
    timeout: (hp, enemy) => `Time ran out: ${enemy} still had ${hp}% HP.`,
    diedTo: (source, pct) => `${source} caused ${pct}% of the damage taken.`,
    idle: (pct) => `No skill was ready for ${pct}% of the fight.`,
    unused: (skill) => `${skill} was never cast.`,
    resisted: (enemy, pct, school, skills) =>
      `${enemy} resists ${school} damage by ${pct}% (${skills}).`,
    synergy: (name) => `One more skill would activate ${name}.`,
    noDefense: 'No heal or shield in the build.',
    school: { physical: 'physical', fire: 'fire', ice: 'ice', arcane: 'arcane' },
    winRatePts: (n) => `${n} win-rate pts`,
    dpsPct: (n) => `${n}% DPS`,
    negligible: 'negligible impact',
    win: (s, canImprove) =>
      `Won in ${s} s. ${canImprove ? 'A tweak can still speed up your fights.' : 'Your build is solid here.'}`,
    loss: (enemy) => `Defeat against ${enemy}.`,
  },
};

/** Diagnostic local, dans la langue du résumé (`summarizeCombatLog(log, locale)`). */
export function diagnose(summary: CombatSummary, locale: Locale = 'fr'): CoachProblem[] {
  const T = COACH_TEXTS[locale];
  const problems: CoachProblem[] = [];
  const top = summary.deathCauses[0];
  if (summary.endReason === 'timeout') {
    problems.push({
      type: 'low_damage',
      detail: T.timeout(summary.enemy.hpLeftPct, summary.enemy.name),
    });
  }
  if (summary.endReason === 'heroDefeated' && top) {
    problems.push({ type: 'died_to', detail: T.diedTo(top.name, top.sharePct) });
  }
  if (summary.idlePct >= 25) {
    problems.push({ type: 'idle_time', detail: T.idle(summary.idlePct) });
  }
  for (const id of summary.unusedSkills) {
    const slot = summary.slots.find((s) => s.skillId === id);
    problems.push({ type: 'unused_skill', detail: T.unused(slot?.name ?? id) });
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
        detail: T.resisted(
          summary.enemy.name,
          Math.round((value ?? 0) * 100),
          T.school[school] ?? school,
          hit.map((h) => h.name).join(', '),
        ),
      });
    }
  }
  for (const syn of summary.synergies.nearlyActive.slice(0, 2)) {
    problems.push({ type: 'missing_synergy', detail: T.synergy(syn.name) });
  }
  if (
    summary.outcome === 'loss' &&
    summary.defense.healingDone + summary.defense.shieldAbsorbed === 0
  ) {
    problems.push({ type: 'low_survivability', detail: T.noDefense });
  }
  return problems;
}

/**
 * Recherche exhaustive des meilleurs remplacements d'un slot, mesurés par le moteur.
 * Criblage rapide (screenRuns) puis confirmation sur `runs` combats.
 */
export function findBestSwaps(
  state: GameState,
  target: EvalTarget,
  options: { max?: number; screenRuns?: number; runs?: number; locale?: Locale } = {},
): VerifiedSuggestion[] {
  const { max = 3, screenRuns = 6, runs = 20, locale = 'fr' } = options;
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
      verified.suggestion.expectedImpact = formatImpact(verified.comparison, locale);
      confirmed.push(verified);
      usedSlots.add(cand.slot);
      usedSkills.add(cand.to);
    }
  }
  return confirmed;
}

export function formatImpact(c: BuildComparison, locale: Locale = 'fr'): string {
  const T = COACH_TEXTS[locale];
  const signed = (n: number) => `${n > 0 ? '+' : ''}${n}`;
  const wr = Math.round(c.winRateDelta * 100);
  const dps = Math.round(c.dpsDeltaPct * 100);
  const parts: string[] = [];
  if (wr !== 0) parts.push(T.winRatePts(signed(wr)));
  if (dps !== 0) parts.push(T.dpsPct(signed(dps)));
  return parts.length ? parts.join(', ') : T.negligible;
}

/** Conseil complet sans IA : diagnostic + meilleurs remplacements mesurés. */
export function localCoach(
  state: GameState,
  summary: CombatSummary,
  target: EvalTarget,
  locale: Locale = 'fr',
): { advice: CoachAdvice; verified: VerifiedSuggestion[] } {
  const T = COACH_TEXTS[locale];
  const problems = diagnose(summary, locale);
  const verified = findBestSwaps(state, target, { max: 2, locale });
  const main = problems[0];
  const explanation =
    summary.outcome === 'win'
      ? T.win(summary.durationS, verified.length > 0)
      : `${T.loss(summary.enemy.name)} ${main ? main.detail : ''}`.trim();
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
