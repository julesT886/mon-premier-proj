/**
 * Rapport de méta : pour chaque classe, chaque boss et deux niveaux, l'optimiseur du
 * coach construit le meilleur build (4 remplacements gloutons mesurés sur 20 combats).
 * Sert à rééquilibrer à partir de données : une compétence présente partout est trop
 * forte, une compétence jamais choisie est trop faible.
 *
 * Usage : pnpm --filter @brumeterre/game-core meta
 */
import {
  applyBuild,
  createNewGame,
  evaluateBuild,
  findBestSwaps,
  REGIONS,
  SKILLS,
  SKILLS_BY_ID,
  type ClassId,
  type GameState,
  type RegionId,
} from '../src/index';

/** Progression supposée d'un joueur arrivant au boss de chaque région. */
const RELICS: Record<RegionId, string[]> = {
  forest: [],
  volcano: ['lantern_seed', 'mossheart_charm'],
  coast: ['lantern_seed', 'mossheart_charm', 'cinder_crown', 'obsidian_scale'],
};
const RANK: Record<RegionId, number> = { forest: 1, volcano: 2, coast: 3 };

const freq = new Map<string, number>();
let scenarios = 0;

for (const classId of ['warrior', 'mage'] as ClassId[]) {
  for (const region of REGIONS) {
    for (const level of [region.bossLevel - 2, region.bossLevel]) {
      let state: GameState = createNewGame({ heroName: 'Meta', classId, playerSeed: 'meta' });
      state.hero.level = level;
      state.activeRegion = region.id;
      state.relics = RELICS[region.id];
      state.skillRanks = Object.fromEntries(
        Object.keys(SKILLS_BY_ID).map((k) => [k, RANK[region.id]]),
      );
      const target = { kind: 'boss' as const, region: region.id };
      const start = evaluateBuild(state, state.build, target);
      for (let i = 0; i < 4; i++) {
        const [best] = findBestSwaps(state, target, { max: 1 });
        if (!best) break;
        const res = applyBuild(state, best.build);
        if (res.ok) state = res.state;
      }
      const end = evaluateBuild(state, state.build, target);
      scenarios += 1;
      for (const id of state.build.slots) if (id) freq.set(id, (freq.get(id) ?? 0) + 1);
      console.log(
        `${classId.padEnd(7)} ${region.id.padEnd(7)} niv. ${String(level).padEnd(2)}  ` +
          `départ ${pct(start.winRate)} → optimisé ${pct(end.winRate)}  ${state.build.slots.join(', ')}`,
      );
    }
  }
}

console.log(`\nFréquence dans les ${scenarios} builds optimisés :`);
for (const skill of [...SKILLS].sort((a, b) => (freq.get(b.id) ?? 0) - (freq.get(a.id) ?? 0))) {
  const n = freq.get(skill.id) ?? 0;
  console.log(`  ${String(n).padStart(2)}/${scenarios}  ${skill.id}`);
}

function pct(x: number): string {
  return `${Math.round(x * 100)} %`.padStart(5);
}
