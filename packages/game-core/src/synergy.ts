import { SKILLS_BY_ID } from './content/skills';
import { SYNERGIES } from './content/synergies';
import { addModifiers, emptyModifiers } from './stats';
import type { Build, Modifiers, SynergyDef, SynergyId, Tag } from './types';
import { ALL_TAGS } from './types';

export type TagCounts = Record<Tag, number>;

export function countTags(build: Build): TagCounts {
  const counts = Object.fromEntries(ALL_TAGS.map((t) => [t, 0])) as TagCounts;
  for (const id of build.slots) {
    if (!id) continue;
    const skill = SKILLS_BY_ID[id];
    if (!skill) continue;
    for (const tag of skill.tags) counts[tag] += 1;
  }
  return counts;
}

/** Nombre de compétences du build portant au moins un des tags donnés. */
function countAnyOf(build: Build, tags: readonly Tag[]): number {
  let n = 0;
  for (const id of build.slots) {
    const skill = id ? SKILLS_BY_ID[id] : undefined;
    if (skill && skill.tags.some((t) => tags.includes(t))) n += 1;
  }
  return n;
}

export interface SynergyStatus {
  id: SynergyId;
  active: boolean;
  /** Nombre total de compétences manquantes pour l'activer (0 si active). */
  missing: number;
}

export function evaluateSynergies(build: Build): SynergyStatus[] {
  return SYNERGIES.map((syn) => {
    let missing = 0;
    for (const req of syn.requires) {
      missing += Math.max(0, req.count - countAnyOf(build, req.anyOf));
    }
    return { id: syn.id, active: missing === 0, missing };
  });
}

export function activeSynergies(build: Build): SynergyDef[] {
  const statuses = evaluateSynergies(build);
  return SYNERGIES.filter((_, i) => statuses[i]?.active);
}

export function synergyModifiers(build: Build): Modifiers {
  const mods = emptyModifiers();
  for (const syn of activeSynergies(build)) addModifiers(mods, syn.bonus);
  return mods;
}
