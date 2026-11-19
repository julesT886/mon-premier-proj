import { SKILLS_BY_ID } from './content/skills';
import { CLASSES } from './content/classes';
import { COMPANIONS_BY_ID, ENEMIES_BY_ID, REGIONS_BY_ID, RELICS_BY_ID } from './content/world';
import type { OfflineEvent } from './offline';
import { hashString, Rng } from './rng';
import type { CompanionId, Locale, Localized, RegionId } from './types';

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
  /** Langue du récap local (français par défaut). */
  locale?: Locale;
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

/** Tous les textes d'une langue. Ajouter une langue = ajouter un paquet complet (typé). */
interface RecapTexts {
  intro: Record<RecapTone, Line[]>;
  kills: Record<RecapTone, Line>;
  ambient: Record<RegionId, string[]>;
  filler: string[];
  closing: Record<RecapTone, Line[]>;
  defaultCompanion: string;
  duration: (minutes: number) => string;
  bossDefeated: Record<RecapTone, (boss: string, c: Ctx) => string>;
  bossFailed: (boss: string, c: Ctx, funny: boolean) => string;
  regionUnlocked: (region: string) => string;
  treasure: (gold: number) => string;
  merchant: (gold: number, funny: boolean) => string;
  dualClass: (cls: string, c: Ctx) => string;
  relics: (list: string, plural: boolean, c: Ctx, funny: boolean) => string;
  and: string;
  levels: (count: number, level: number, c: Ctx) => string;
  skills: (names: string) => string;
  hook: {
    region: (region: string) => string;
    boss: (boss: string) => string;
    skills: string;
    fallback: (c: Ctx) => string;
  };
}

const FR: RecapTexts = {
  intro: {
    epic: [
      (c) =>
        `Pendant ${c.hours}, ${c.hero} a tenu ${c.region} sans faiblir, la brume pour seule bannière.`,
      (c) =>
        `Tandis que tu dormais, ${c.hero} a marché sur ${c.region}, et la terre s'en souvient.`,
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
  },
  kills: {
    epic: (c) => `${c.kills} adversaires sont tombés sous ses coups.`,
    humorous: (c) => `Bilan : ${c.kills} monstres vaincus, et zéro pause goûter réglementaire.`,
    cozy: (c) => `${c.kills} créatures ont été repoussées, sans hâte mais sans relâche.`,
  },
  ambient: {
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
  },
  filler: [
    'La brume de Brumeterre s’est levée puis refermée, comme une page que l’on tourne.',
    'Chaque pas rapprochait un peu plus le héros des souvenirs qu’il a perdus.',
    'Le soir, autour du feu, on a parlé de toi et de ton prochain retour.',
  ],
  closing: {
    epic: [(c) => `${c.companion} grave déjà ces exploits dans sa mémoire.`],
    humorous: [
      (c) => `${c.companion} réclame une prime de risque. La demande est en cours d'examen.`,
    ],
    cozy: [(c) => `${c.companion} a allumé un petit feu et attend ton retour.`],
  },
  defaultCompanion: 'Ton compagnon',
  duration: (minutes) => {
    if (minutes < 60) return `${Math.max(1, minutes)} minute${minutes > 1 ? 's' : ''}`;
    const h = Math.floor(minutes / 60);
    return `${h} heure${h > 1 ? 's' : ''}`;
  },
  bossDefeated: {
    epic: (boss, c) => `Dans un fracas terrible, ${boss} a enfin plié le genou devant ${c.hero}.`,
    humorous: (boss, c) => `${boss} a perdu. ${boss} n'a pas apprécié. ${c.hero}, si.`,
    cozy: (boss) =>
      `Le combat contre ${boss} s'est achevé par une victoire, et un calme nouveau s'est posé sur la région.`,
  },
  bossFailed: (boss, c, funny) =>
    funny
      ? `Une tentative contre ${boss} s'est soldée par un repli stratégique. Très stratégique.`
      : `${boss} a repoussé un premier assaut, mais ${c.hero} a retenu la leçon.`,
  regionUnlocked: (region) => `Au loin, la route vers ${region} s'est ouverte.`,
  treasure: (gold) => `Un coffre oublié a livré ${gold} pièces d'or.`,
  merchant: (gold, funny) =>
    funny
      ? `Un marchand ambulant a négocié âprement. Il est reparti ruiné de ${gold} pièces.`
      : `Un marchand de passage a échangé quelques trouvailles contre ${gold} pièces d'or.`,
  dualClass: (cls, c) => `Un éveil soudain : le don du ${cls} s'est révélé à ${c.hero}.`,
  relics: (list, plural, c, funny) => {
    const what = plural ? 'des reliques' : 'une relique';
    return funny
      ? `${c.hero} a ramassé ${what} (${list}) sous un caillou. Personne ne sait ce que ça faisait là.`
      : `Au détour d'un combat, ${c.hero} a découvert ${what} : ${list}.`;
  },
  and: 'et',
  levels: (count, level, c) =>
    count === 1
      ? `${c.hero} a atteint le niveau ${level}.`
      : `${c.hero} a gagné ${count} niveaux et atteint le niveau ${level}.`,
  skills: (names) => `Nouvelle technique maîtrisée : ${names}.`,
  hook: {
    region: (region) => `${region} t'attend : oseras-tu y poser le pied ?`,
    boss: (boss) => `${boss} attend sa revanche. Et si tu revoyais ton build ?`,
    skills: `De nouvelles compétences t'attendent dans l'écran Build.`,
    fallback: (c) => `${c.companion} a repéré quelque chose d'étrange plus loin dans ${c.region}…`,
  },
};

const EN: RecapTexts = {
  intro: {
    epic: [
      (c) =>
        `For ${c.hours}, ${c.hero} held ${c.region} without faltering, with the mist as their only banner.`,
      (c) => `While you slept, ${c.hero} marched across ${c.region}, and the land remembers it.`,
    ],
    humorous: [
      (c) =>
        `For ${c.hours}, ${c.hero} went on "just a quick stroll" through ${c.region}. ${c.companion} disputes the word "quick".`,
      (c) =>
        `With you gone, ${c.hero} decided ${c.region} needed a thorough spring cleaning. With a sword.`,
    ],
    cozy: [
      (c) =>
        `For ${c.hours}, ${c.hero} wandered the paths of ${c.region}, at the gentle pace of the lanterns.`,
      (c) =>
        `Far from you, ${c.hero} found a steady rhythm in ${c.region}, ${c.companion} always close by.`,
    ],
  },
  kills: {
    epic: (c) => `${c.kills} foes fell before them.`,
    humorous: (c) => `Tally: ${c.kills} monsters defeated, and zero regulation snack breaks.`,
    cozy: (c) => `${c.kills} creatures were driven back, without haste but without rest.`,
  },
  ambient: {
    forest: [
      'The lantern-trees whispered their name as evening fell.',
      'The moss kept the trace of their steps like a secret.',
      'A warm breeze set golden spores dancing between the trunks.',
      'Somewhere, a brook told stories that only foxes understand.',
      'Ancient roots seemed to part to open the way.',
    ],
    volcano: [
      'Lava flows traced runes that no one can read anymore.',
      'The black rock rumbled softly, like a dreaming giant.',
      'Ash drifted down slowly, like a grey snow.',
      'The heat made the horizon shimmer like a stubborn mirage.',
      'Sulphur crystals glinted in the cracks, like watchful eyes.',
    ],
    coast: [
      'The two moons pulled the tide in opposite directions.',
      'The foam sang against the salt cliffs.',
      'Glints of nacre raced across the waves to the horizon.',
      'Mist gulls circled in silence above the wrecks.',
      'Salt clung to their lashes, and the sea seemed to hold its breath.',
    ],
  },
  filler: [
    'The mist of Brumeterre rose and closed again, like a page being turned.',
    'Every step brought the hero a little closer to the memories they lost.',
    'In the evening, around the fire, there was talk of you and your return.',
  ],
  closing: {
    epic: [(c) => `${c.companion} is already carving these deeds into memory.`],
    humorous: [(c) => `${c.companion} is asking for hazard pay. The request is under review.`],
    cozy: [(c) => `${c.companion} has lit a small fire and is waiting for you.`],
  },
  defaultCompanion: 'Your companion',
  duration: (minutes) => {
    if (minutes < 60) return `${Math.max(1, minutes)} minute${minutes > 1 ? 's' : ''}`;
    const h = Math.floor(minutes / 60);
    return `${h} hour${h > 1 ? 's' : ''}`;
  },
  bossDefeated: {
    epic: (boss, c) => `In a terrible crash, ${boss} finally bowed before ${c.hero}.`,
    humorous: (boss, c) => `${boss} lost. ${boss} did not enjoy it. ${c.hero} did.`,
    cozy: (boss) =>
      `The fight against ${boss} ended in victory, and a new calm settled over the region.`,
  },
  bossFailed: (boss, c, funny) =>
    funny
      ? `An attempt on ${boss} ended in a strategic retreat. A very strategic one.`
      : `${boss} pushed back a first assault, but ${c.hero} learned the lesson.`,
  regionUnlocked: (region) => `In the distance, the road to ${region} opened.`,
  treasure: (gold) => `A forgotten chest yielded ${gold} gold coins.`,
  merchant: (gold, funny) =>
    funny
      ? `A travelling merchant haggled hard. They left ${gold} coins poorer.`
      : `A passing merchant traded a few finds for ${gold} gold coins.`,
  dualClass: (cls, c) => `A sudden awakening: the gift of the ${cls} revealed itself to ${c.hero}.`,
  relics: (list, plural, c, funny) => {
    const what = plural ? 'relics' : 'a relic';
    return funny
      ? `${c.hero} picked up ${what} (${list}) under a rock. Nobody knows what it was doing there.`
      : `Between two fights, ${c.hero} discovered ${what}: ${list}.`;
  },
  and: 'and',
  levels: (count, level, c) =>
    count === 1
      ? `${c.hero} reached level ${level}.`
      : `${c.hero} gained ${count} levels and reached level ${level}.`,
  skills: (names) => `New technique mastered: ${names}.`,
  hook: {
    region: (region) => `${region} awaits: will you dare set foot there?`,
    boss: (boss) => `${boss} awaits a rematch. Why not revisit your build?`,
    skills: 'New skills are waiting for you on the Build screen.',
    fallback: (c) => `${c.companion} spotted something strange further into ${c.region}…`,
  },
};

const TEXTS: Record<Locale, RecapTexts> = { fr: FR, en: EN };

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

function eventLine(e: OfflineEvent, tone: RecapTone, c: Ctx, T: RecapTexts, l: Locale) {
  const name = (text: Localized | undefined, fallback: string) =>
    text ? (text[l] ?? text.fr) : fallback;
  const funny = tone === 'humorous';
  switch (e.type) {
    case 'boss_defeated':
      return T.bossDefeated[tone](name(ENEMIES_BY_ID[e.enemyId]?.name, e.enemyId), c);
    case 'boss_failed':
      return T.bossFailed(name(ENEMIES_BY_ID[e.enemyId]?.name, e.enemyId), c, funny);
    case 'region_unlocked':
      return T.regionUnlocked(name(REGIONS_BY_ID[e.region].name, e.region));
    case 'treasure':
      return T.treasure(e.gold);
    case 'merchant':
      return T.merchant(e.gold, funny);
    case 'dual_class_unlocked':
      return T.dualClass(name(CLASSES[e.classId].name, e.classId), c);
    case 'rare_item':
    case 'level_up':
    case 'skill_unlocked':
      return null; // agrégés à part
  }
}

/**
 * Récap local par templates, déterministe (même entrée → même texte).
 * Garantit 60-100 mots et une phrase d'accroche : utilisé quand l'IA est
 * indisponible, lente (> 4 s) ou renvoie une sortie invalide.
 */
export function buildLocalRecap(input: RecapInput): Recap {
  const locale = input.locale ?? 'fr';
  const T = TEXTS[locale];
  const name = (text: Localized | undefined, fallback: string) =>
    text ? (text[locale] ?? text.fr) : fallback;
  const rng = new Rng(
    `recap:${hashString(JSON.stringify([input.heroName, input.region, input.tone, input.kills, input.events]))}`,
  );
  const companionId = input.companions.at(-1);
  const c: Ctx = {
    hero: input.heroName,
    region: name(REGIONS_BY_ID[input.region].name, input.region),
    companion: (companionId && name(COMPANIONS_BY_ID[companionId]?.name, '')) || T.defaultCompanion,
    hours: T.duration(Math.floor(input.elapsedMs / 60000)),
    kills: input.kills,
  };

  const sentences: string[] = [rng.pick(T.intro[input.tone])(c)];
  if (input.kills > 0) sentences.push(T.kills[input.tone](c));

  const defeated = new Set(
    input.events.flatMap((e) => (e.type === 'boss_defeated' ? [e.enemyId] : [])),
  );
  const sorted = [...input.events]
    // Un échec suivi d'une victoire sur le même boss n'est pas raconté.
    .filter((e) => !(e.type === 'boss_failed' && defeated.has(e.enemyId)))
    .sort((a, b) => PRIORITY[a.type] - PRIORITY[b.type] || a.ts - b.ts);
  const relics = [
    ...new Set(input.events.flatMap((e) => (e.type === 'rare_item' ? [e.relicId] : []))),
  ].map((id) => name(RELICS_BY_ID[id]?.name, id));
  const seen = new Set<string>();
  for (const e of sorted) {
    const key =
      e.type === 'merchant' || e.type === 'treasure' ? e.type : JSON.stringify({ ...e, ts: 0 });
    if (seen.has(key)) continue;
    seen.add(key);
    const line = eventLine(e, input.tone, c, T, locale);
    if (line) sentences.push(line);
  }
  if (relics.length > 0) {
    const list =
      relics.length === 1
        ? (relics[0] as string)
        : `${relics.slice(0, -1).join(', ')} ${T.and} ${relics.at(-1)}`;
    sentences.splice(
      Math.min(sentences.length, 4),
      0,
      T.relics(list, relics.length > 1, c, input.tone === 'humorous'),
    );
  }
  const levels = input.events.filter((e) => e.type === 'level_up');
  if (levels.length > 0) {
    const last = levels.at(-1) as Extract<OfflineEvent, { type: 'level_up' }>;
    sentences.push(T.levels(levels.length, last.level, c));
  }
  const skills = input.events.filter((e) => e.type === 'skill_unlocked');
  if (skills.length > 0) {
    const names = skills.map((e) => name(SKILLS_BY_ID[e.skillId]?.name, e.skillId));
    sentences.push(T.skills(names.slice(0, 2).join(` ${T.and} `)));
  }

  const closing = rng.pick(T.closing[input.tone])(c);
  const ambient = [...T.ambient[input.region]];
  const filler = [...T.filler];

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

  return { story, hook: buildHook(input, c, T, name), source: 'template' };
}

function buildHook(
  input: RecapInput,
  c: Ctx,
  T: RecapTexts,
  name: (text: Localized | undefined, fallback: string) => string,
): string {
  const unlocked = input.events.find((e) => e.type === 'region_unlocked');
  if (unlocked && unlocked.type === 'region_unlocked') {
    return T.hook.region(name(REGIONS_BY_ID[unlocked.region].name, unlocked.region));
  }
  const failed = input.events.find((e) => e.type === 'boss_failed');
  if (failed && failed.type === 'boss_failed') {
    return T.hook.boss(name(ENEMIES_BY_ID[failed.enemyId]?.name, failed.enemyId));
  }
  if (input.events.some((e) => e.type === 'dual_class_unlocked' || e.type === 'skill_unlocked')) {
    return T.hook.skills;
  }
  return T.hook.fallback(c);
}
