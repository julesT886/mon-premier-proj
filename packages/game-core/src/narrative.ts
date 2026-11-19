import { SKILLS_BY_ID } from './content/skills';
import { CLASSES } from './content/classes';
import { COMPANIONS_BY_ID, ENEMIES_BY_ID, REGIONS_BY_ID, RELICS_BY_ID } from './content/world';
import type { OfflineEvent } from './offline';
import { hashString, Rng } from './rng';
import type { CompanionId, RegionId } from './types';

export type RecapTone = 'epic' | 'humorous' | 'cozy';
export const RECAP_TONES: readonly RecapTone[] = ['epic', 'humorous', 'cozy'];

export interface RecapInput {
  heroName: string;
  region: RegionId;
  companions: readonly CompanionId[];
  tone: RecapTone;
  events: readonly OfflineEvent[];
  kills: number;
  elapsedMs: number;
}

export interface Recap {
  story: string;
  hook: string;
  source: 'template' | 'ai';
}

export const RECAP_MIN_WORDS = 60;
export const RECAP_MAX_WORDS = 100;

type Ctx = { hero: string; region: string; companion: string; hours: string; kills: number };
type Line = (c: Ctx) => string;

const INTRO: Record<RecapTone, Line[]> = {
  epic: [
    (c) =>
      `Pendant ${c.hours}, ${c.hero} a tenu ${c.region} sans faiblir, la brume pour seule bannière.`,
    (c) => `Tandis que tu dormais, ${c.hero} a marché sur ${c.region}, et la terre s'en souvient.`,
  ],
  humorous: [
    (c) =>
      `Pendant ${c.hours}, ${c.hero} a « juste fait un petit tour » dans ${c.region}. ${c.companion} conteste le mot « petit ».`,
    (c) =>
      `Toi parti, ${c.hero} a décidé que ${c.region} avait besoin d'un grand ménage. Avec une épée.`,
  ],
  cozy: [
    (c) =>
      `Pendant ${c.hours}, ${c.hero} a suivi les sentiers de ${c.region}, au rythme tranquille des lanternes.`,
    (c) =>
      `Loin de toi, ${c.hero} a trouvé son rythme dans ${c.region}, ${c.companion} toujours à ses côtés.`,
  ],
};

const KILLS: Record<RecapTone, Line> = {
  epic: (c) => `${c.kills} adversaires sont tombés sous ses coups.`,
  humorous: (c) => `Bilan : ${c.kills} monstres vaincus, et zéro pause goûter réglementaire.`,
  cozy: (c) => `${c.kills} créatures ont été repoussées, sans hâte mais sans relâche.`,
};

const AMBIENT: Record<RegionId, string[]> = {
  forest: [
    'Les arbres-lanternes ont murmuré son nom à la tombée du soir.',
    'La mousse gardait la trace de ses pas comme un secret.',
    'Un vent tiède faisait danser les spores dorées entre les troncs.',
    'Quelque part, un ruisseau racontait des histoires que seuls les renards comprennent.',
    'Les racines anciennes semblaient s’écarter pour lui ouvrir le chemin.',
  ],
  volcano: [
    'Les coulées de lave dessinaient des runes que personne ne sait plus lire.',
    'La roche noire grondait doucement, comme un géant qui rêve.',
    'Des cendres tombaient lentement, pareilles à une neige grise.',
    'La chaleur faisait trembler l’horizon comme un mirage obstiné.',
    'Des cristaux de soufre brillaient dans les fissures, tels des yeux attentifs.',
  ],
  coast: [
    'Les deux lunes tiraient la marée dans des directions opposées.',
    "L'écume chantait contre les falaises de sel.",
    'Des reflets de nacre couraient sur les vagues jusqu’à l’horizon.',
    'Les mouettes de brume tournaient en silence au-dessus des épaves.',
    'Le sel collait aux cils, et la mer semblait retenir son souffle.',
  ],
};

/** Réserve neutre si l'ambiance de la région ne suffit pas à atteindre RECAP_MIN_WORDS. */
const GENERIC_FILLER = [
  'La brume de Brumeterre s’est levée puis refermée, comme une page que l’on tourne.',
  'Chaque pas rapprochait un peu plus le héros des souvenirs qu’il a perdus.',
  'Le soir, autour du feu, on a parlé de toi et de ton prochain retour.',
];

const CLOSING: Record<RecapTone, Line[]> = {
  epic: [(c) => `${c.companion} grave déjà ces exploits dans sa mémoire.`],
  humorous: [
    (c) => `${c.companion} réclame une prime de risque. La demande est en cours d'examen.`,
  ],
  cozy: [(c) => `${c.companion} a allumé un petit feu et attend ton retour.`],
};

function eventLine(e: OfflineEvent, tone: RecapTone, c: Ctx): string | null {
  const epic = tone === 'epic';
  const funny = tone === 'humorous';
  switch (e.type) {
    case 'boss_defeated': {
      const boss = ENEMIES_BY_ID[e.enemyId]?.name.fr ?? e.enemyId;
      if (epic) return `Dans un fracas terrible, ${boss} a enfin plié le genou devant ${c.hero}.`;
      if (funny) return `${boss} a perdu. ${boss} n'a pas apprécié. ${c.hero}, si.`;
      return `Le combat contre ${boss} s'est achevé par une victoire, et un calme nouveau s'est posé sur la région.`;
    }
    case 'boss_failed': {
      const boss = ENEMIES_BY_ID[e.enemyId]?.name.fr ?? e.enemyId;
      if (funny)
        return `Une tentative contre ${boss} s'est soldée par un repli stratégique. Très stratégique.`;
      return `${boss} a repoussé un premier assaut, mais ${c.hero} a retenu la leçon.`;
    }
    case 'region_unlocked': {
      const region = REGIONS_BY_ID[e.region].name.fr;
      return `Au loin, la route vers ${region} s'est ouverte.`;
    }
    case 'rare_item':
      return null; // agrégées à part
    case 'treasure':
      return `Un coffre oublié a livré ${e.gold} pièces d'or.`;
    case 'merchant':
      if (funny)
        return `Un marchand ambulant a négocié âprement. Il est reparti ruiné de ${e.gold} pièces.`;
      return `Un marchand de passage a échangé quelques trouvailles contre ${e.gold} pièces d'or.`;
    case 'dual_class_unlocked': {
      const cls = CLASSES[e.classId].name.fr;
      return `Un éveil soudain : le don du ${cls} s'est révélé à ${c.hero}.`;
    }
    case 'level_up':
    case 'skill_unlocked':
      return null; // agrégés à part
  }
}

const PRIORITY: Record<OfflineEvent['type'], number> = {
  boss_defeated: 0,
  region_unlocked: 1,
  dual_class_unlocked: 2,
  rare_item: 3,
  boss_failed: 4,
  merchant: 5,
  treasure: 6,
  level_up: 7,
  skill_unlocked: 8,
};

export function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

function formatHours(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${Math.max(1, minutes)} minute${minutes > 1 ? 's' : ''}`;
  const h = Math.floor(minutes / 60);
  return `${h} heure${h > 1 ? 's' : ''}`;
}

/**
 * Récap local par templates, déterministe (même entrée → même texte).
 * Garantit 60-100 mots et une phrase d'accroche : utilisé quand l'IA est
 * indisponible, lente (> 4 s) ou renvoie une sortie invalide.
 */
export function buildLocalRecap(input: RecapInput): Recap {
  const rng = new Rng(
    `recap:${hashString(JSON.stringify([input.heroName, input.region, input.tone, input.kills, input.events]))}`,
  );
  const companionId = input.companions.at(-1);
  const c: Ctx = {
    hero: input.heroName,
    region: REGIONS_BY_ID[input.region].name.fr,
    companion: (companionId && COMPANIONS_BY_ID[companionId]?.name.fr) || 'Ton compagnon',
    hours: formatHours(input.elapsedMs),
    kills: input.kills,
  };

  const sentences: string[] = [rng.pick(INTRO[input.tone])(c)];
  if (input.kills > 0) sentences.push(KILLS[input.tone](c));

  const defeated = new Set(
    input.events.flatMap((e) => (e.type === 'boss_defeated' ? [e.enemyId] : [])),
  );
  const sorted = [...input.events]
    // Un échec suivi d'une victoire sur le même boss n'est pas raconté.
    .filter((e) => !(e.type === 'boss_failed' && defeated.has(e.enemyId)))
    .sort((a, b) => PRIORITY[a.type] - PRIORITY[b.type] || a.ts - b.ts);
  const relics = [
    ...new Set(input.events.flatMap((e) => (e.type === 'rare_item' ? [e.relicId] : []))),
  ].map((id) => RELICS_BY_ID[id]?.name.fr ?? id);
  const seen = new Set<string>();
  for (const e of sorted) {
    const key =
      e.type === 'merchant' || e.type === 'treasure' ? e.type : JSON.stringify({ ...e, ts: 0 });
    if (seen.has(key)) continue;
    seen.add(key);
    const line = eventLine(e, input.tone, c);
    if (line) sentences.push(line);
  }
  if (relics.length > 0) {
    const list =
      relics.length === 1 ? relics[0] : `${relics.slice(0, -1).join(', ')} et ${relics.at(-1)}`;
    const what = relics.length > 1 ? 'des reliques' : 'une relique';
    sentences.splice(
      Math.min(sentences.length, 4),
      0,
      input.tone === 'humorous'
        ? `${c.hero} a ramassé ${what} (${list}) sous un caillou. Personne ne sait ce que ça faisait là.`
        : `Au détour d'un combat, ${c.hero} a découvert ${what} : ${list}.`,
    );
  }
  const levels = input.events.filter((e) => e.type === 'level_up');
  if (levels.length > 0) {
    const last = levels.at(-1) as Extract<OfflineEvent, { type: 'level_up' }>;
    sentences.push(
      levels.length === 1
        ? `${c.hero} a atteint le niveau ${last.level}.`
        : `${c.hero} a gagné ${levels.length} niveaux et atteint le niveau ${last.level}.`,
    );
  }
  const skills = input.events.filter((e) => e.type === 'skill_unlocked');
  if (skills.length > 0) {
    const names = skills.map((e) => SKILLS_BY_ID[e.skillId]?.name.fr ?? e.skillId);
    sentences.push(`Nouvelle technique maîtrisée : ${names.slice(0, 2).join(' et ')}.`);
  }

  const closing = rng.pick(CLOSING[input.tone])(c);
  const ambient = [...AMBIENT[input.region]];
  const filler = [...GENERIC_FILLER];

  // Tronque les événements secondaires si trop long, complète avec l'ambiance si trop court.
  let body = [...sentences];
  const wordsOf = (parts: string[]) => countWords([...parts, closing].join(' '));
  while (wordsOf(body) > RECAP_MAX_WORDS && body.length > 2) body.pop();
  while (wordsOf(body) < RECAP_MIN_WORDS && ambient.length + filler.length > 0) {
    const pool = ambient.length > 0 ? ambient : filler;
    const pick = pool.splice(rng.int(0, pool.length - 1), 1)[0] as string;
    body = [body[0] as string, pick, ...body.slice(1)];
  }
  while (wordsOf(body) > RECAP_MAX_WORDS && body.length > 2) body.splice(1, 1);
  const story = [...body, closing].join(' ');

  return { story, hook: buildHook(input, c), source: 'template' };
}

function buildHook(input: RecapInput, c: Ctx): string {
  const unlocked = input.events.find((e) => e.type === 'region_unlocked');
  if (unlocked && unlocked.type === 'region_unlocked') {
    return `${REGIONS_BY_ID[unlocked.region].name.fr} t'attend : oseras-tu y poser le pied ?`;
  }
  const failed = input.events.find((e) => e.type === 'boss_failed');
  if (failed && failed.type === 'boss_failed') {
    const boss = ENEMIES_BY_ID[failed.enemyId]?.name.fr ?? failed.enemyId;
    return `${boss} attend sa revanche. Et si tu revoyais ton build ?`;
  }
  if (input.events.some((e) => e.type === 'dual_class_unlocked' || e.type === 'skill_unlocked')) {
    return `De nouvelles compétences t'attendent dans l'écran Build.`;
  }
  return `${c.companion} a repéré quelque chose d'étrange plus loin dans ${c.region}…`;
}
