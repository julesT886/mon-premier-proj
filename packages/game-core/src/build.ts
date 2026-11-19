import { DUAL_CLASS_LEVEL } from './constants';
import { SKILLS, SKILLS_BY_ID } from './content/skills';
import type { Build, ClassId, SkillDef, SkillId } from './types';
import { BUILD_SLOTS } from './types';

/** La seconde classe s'ouvre au niveau DUAL_CLASS_LEVEL (double classe). */
export function isDualClassUnlocked(level: number): boolean {
  return level >= DUAL_CLASS_LEVEL;
}

export function isSkillAvailable(skill: SkillDef, startingClass: ClassId, level: number): boolean {
  if (level < skill.requiredLevel) return false;
  if (skill.classId !== startingClass && !isDualClassUnlocked(level)) return false;
  return true;
}

export function availableSkills(startingClass: ClassId, level: number): SkillDef[] {
  return SKILLS.filter((s) => isSkillAvailable(s, startingClass, level));
}

export type BuildError =
  | { code: 'wrong_slot_count'; expected: number; actual: number }
  | { code: 'unknown_skill'; skillId: SkillId }
  | { code: 'locked_skill'; skillId: SkillId }
  | { code: 'duplicate_skill'; skillId: SkillId }
  | { code: 'empty_build' };

export function validateBuild(build: Build, startingClass: ClassId, level: number): BuildError[] {
  const errors: BuildError[] = [];
  if (build.slots.length !== BUILD_SLOTS) {
    errors.push({ code: 'wrong_slot_count', expected: BUILD_SLOTS, actual: build.slots.length });
  }
  const seen = new Set<SkillId>();
  let filled = 0;
  for (const id of build.slots) {
    if (id === null) continue;
    filled += 1;
    const skill = SKILLS_BY_ID[id];
    if (!skill) {
      errors.push({ code: 'unknown_skill', skillId: id });
      continue;
    }
    if (seen.has(id)) errors.push({ code: 'duplicate_skill', skillId: id });
    seen.add(id);
    if (!isSkillAvailable(skill, startingClass, level)) {
      errors.push({ code: 'locked_skill', skillId: id });
    }
  }
  if (filled === 0) errors.push({ code: 'empty_build' });
  return errors;
}

export function isBuildValid(build: Build, startingClass: ClassId, level: number): boolean {
  return validateBuild(build, startingClass, level).length === 0;
}

/** Build de départ : compétences de démarrage de la classe, slot 4 vide. */
export function starterBuild(slots: readonly SkillId[]): Build {
  const filled: (SkillId | null)[] = slots.slice(0, BUILD_SLOTS);
  while (filled.length < BUILD_SLOTS) filled.push(null);
  return { slots: filled };
}

/** Remplace le contenu d'un slot (et retire la compétence d'un autre slot si déjà présente). */
export function setSlot(build: Build, slot: number, skillId: SkillId | null): Build {
  const slots = build.slots.map((s) => (s === skillId && skillId !== null ? null : s));
  slots[slot] = skillId;
  return { slots };
}

/** Échange deux slots (change l'ordre de priorité de lancement). */
export function swapSlots(build: Build, a: number, b: number): Build {
  const slots = [...build.slots];
  const tmp = slots[a] ?? null;
  slots[a] = slots[b] ?? null;
  slots[b] = tmp;
  return { slots };
}
