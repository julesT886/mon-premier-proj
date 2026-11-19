import {
  BUILD_SLOTS,
  COMPANIONS_BY_ID,
  ENEMIES_BY_ID,
  RECAP_TONES,
  REGIONS_BY_ID,
  RELICS_BY_ID,
  SKILLS_BY_ID,
  SYNERGIES,
  type CoachRequest,
  type RecapRequest,
} from '@brumeterre/game-core';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Assainissement
// ---------------------------------------------------------------------------

/** Retire les caractères de contrôle et les chevrons, normalise les espaces, tronque. */
export function sanitizeText(input: string, maxLength: number): string {
  return input
    .normalize('NFC')
    .replace(/[\p{Cc}\p{Cf}]/gu, ' ')
    .replace(/[<>{}[\]`\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

/** Nom de héros : lettres, chiffres, espaces, tiret et apostrophe uniquement. */
export function sanitizeHeroName(input: string): string {
  const cleaned = sanitizeText(input, 64)
    .replace(/[^\p{L}\p{N} '-]/gu, '')
    .trim()
    .slice(0, 24);
  return cleaned.length > 0 ? cleaned : 'Héros';
}

// ---------------------------------------------------------------------------
// Identifiants vérifiés contre le contenu du jeu
// ---------------------------------------------------------------------------

const idIn = (table: Record<string, unknown>, label: string) =>
  z
    .string()
    .max(40)
    .refine((id) => Object.hasOwn(table, id), { message: `unknown ${label}` });

const SkillId = idIn(SKILLS_BY_ID, 'skill');
const EnemyId = idIn(ENEMIES_BY_ID, 'enemy');
const RelicId = idIn(RELICS_BY_ID, 'relic');
const CompanionId = idIn(COMPANIONS_BY_ID, 'companion');
const RegionId = z.enum(Object.keys(REGIONS_BY_ID) as ['forest', 'volcano', 'coast']);
const SynergyId = z.enum(SYNERGIES.map((s) => s.id) as [string, ...string[]]);
const ClassId = z.enum(['warrior', 'mage']);
const Locale = z.enum(['fr', 'en']).default('fr');
const Pct = z.number().min(0).max(100);
const Int = z.number().int().min(0).max(10_000_000);
const HeroSource = z.union([z.literal('basic'), SkillId]);
const EnemySource = z.string().regex(/^(basic|ability:[0-9])$/);

// ---------------------------------------------------------------------------
// /ai/coach
// ---------------------------------------------------------------------------

export const CoachRequestSchema = z.object({
  locale: Locale,
  hero: z.object({ classId: ClassId, level: z.number().int().min(1).max(30) }),
  build: z.array(SkillId.nullable()).length(BUILD_SLOTS),
  availableSkills: z.array(SkillId).max(40),
  summary: z.object({
    outcome: z.enum(['win', 'loss']),
    endReason: z.enum(['enemyDefeated', 'heroDefeated', 'timeout']),
    durationS: z.number().min(0).max(600),
    heroHpLeftPct: Pct,
    enemy: z.object({ id: EnemyId, level: z.number().int().min(1).max(40), hpLeftPct: Pct }),
    slots: z
      .array(
        z.object({ skillId: SkillId.nullable(), casts: Int, damage: Int, damageSharePct: Pct }),
      )
      .length(BUILD_SLOTS),
    topDamage: z
      .array(z.object({ sourceId: HeroSource, damage: Int, sharePct: Pct }))
      .max(10)
      .transform((a) => a.slice(0, 3)),
    deathCauses: z
      .array(z.object({ sourceId: EnemySource, damage: Int, sharePct: Pct }))
      .max(10)
      .transform((a) => a.slice(0, 3)),
    idlePct: Pct,
    unusedSkills: z.array(SkillId).max(BUILD_SLOTS),
    activeSynergies: z.array(SynergyId).max(SYNERGIES.length),
    nearlyActiveSynergies: z.array(SynergyId).max(SYNERGIES.length),
    healingDone: Int,
    shieldAbsorbed: Int,
  }),
}) satisfies z.ZodType<CoachRequest, unknown>;

export type ValidCoachRequest = z.infer<typeof CoachRequestSchema>;

// Sortie attendue du modèle (validée ; sinon fallback).
export const CoachOutputSchema = z.object({
  verdict: z.enum(['win', 'loss']),
  explanation: z.string().min(1).max(600),
  problems: z
    .array(
      z.object({
        type: z.enum([
          'low_damage',
          'died_to',
          'idle_time',
          'unused_skill',
          'resisted_school',
          'missing_synergy',
          'low_survivability',
        ]),
        detail: z.string().min(1).max(240),
      }),
    )
    .max(5),
  suggestions: z
    .array(
      z.object({
        changeSlot: z
          .number()
          .int()
          .min(0)
          .max(BUILD_SLOTS - 1),
        from: z.string().nullable(),
        to: z.string(),
        expectedImpact: z.string().max(160),
      }),
    )
    .max(3),
});

export type CoachOutput = z.infer<typeof CoachOutputSchema>;

// ---------------------------------------------------------------------------
// /ai/recap
// ---------------------------------------------------------------------------

const Ts = z.number().int().min(0).max(1e15);
const OfflineEventSchema = z.discriminatedUnion('type', [
  z.object({ ts: Ts, type: z.literal('level_up'), level: z.number().int().min(1).max(30) }),
  z.object({ ts: Ts, type: z.literal('skill_unlocked'), skillId: SkillId }),
  z.object({ ts: Ts, type: z.literal('dual_class_unlocked'), classId: ClassId }),
  z.object({ ts: Ts, type: z.literal('boss_defeated'), enemyId: EnemyId, region: RegionId }),
  z.object({ ts: Ts, type: z.literal('boss_failed'), enemyId: EnemyId, region: RegionId }),
  z.object({ ts: Ts, type: z.literal('region_unlocked'), region: RegionId }),
  z.object({ ts: Ts, type: z.literal('rare_item'), relicId: RelicId }),
  z.object({ ts: Ts, type: z.literal('treasure'), gold: Int }),
  z.object({
    ts: Ts,
    type: z.literal('merchant'),
    gold: Int,
    sold: Int,
    resource: z.enum(['gold', 'moonsap', 'embershard', 'nacre']),
  }),
]);

export const MAX_RECAP_EVENTS = 40;

export const RecapRequestSchema = z.object({
  locale: Locale,
  heroName: z.string().max(200).transform(sanitizeHeroName),
  region: RegionId,
  companions: z.array(CompanionId).max(5),
  tone: z.enum(RECAP_TONES as unknown as ['epic', 'humorous', 'cozy']),
  events: z
    .array(OfflineEventSchema)
    .max(2000)
    .transform((events) => events.slice(-MAX_RECAP_EVENTS)),
  kills: Int,
  elapsedMs: z
    .number()
    .int()
    .min(0)
    .max(48 * 3600_000),
}) satisfies z.ZodType<RecapRequest, unknown>;

export type ValidRecapRequest = z.infer<typeof RecapRequestSchema>;

export const RecapOutputSchema = z.object({
  story: z.string().min(1).max(1200),
  hook: z.string().min(1).max(240),
});

export type RecapOutput = z.infer<typeof RecapOutputSchema>;

export const DeviceAuthSchema = z.object({ deviceId: z.string().max(64) });
