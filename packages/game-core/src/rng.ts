/**
 * RNG déterministe et sérialisable (sfc32), seedé par une chaîne.
 * N'utilise que des opérations entières 32 bits : identique sur V8, Hermes et JSC.
 */

/** Hash 32 bits FNV-1a d'une chaîne. */
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Combine plusieurs morceaux en une seed stable (ex. `deriveSeed(player, 'chunk', 42)`). */
export function deriveSeed(...parts: (string | number)[]): string {
  return parts.join(':');
}

export interface RngState {
  a: number;
  b: number;
  c: number;
  d: number;
}

export class Rng {
  private s: RngState;

  constructor(seed: string) {
    this.s = {
      a: hashString(`${seed}#a`),
      b: hashString(`${seed}#b`),
      c: hashString(`${seed}#c`),
      d: hashString(`${seed}#d`) | 1,
    };
    // Mélange initial pour décorréler les seeds proches.
    for (let i = 0; i < 12; i++) this.nextUint32();
  }

  nextUint32(): number {
    let { a, b, c, d } = this.s;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    this.s = { a, b, c, d };
    return t >>> 0;
  }

  /** Flottant dans [0, 1). */
  next(): number {
    return this.nextUint32() / 4294967296;
  }

  /** Entier dans [min, max] inclus. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick on empty array');
    return items[Math.floor(this.next() * items.length)] as T;
  }

  /** Choix pondéré : `weights[i]` ≥ 0. */
  weighted<T>(items: readonly T[], weights: readonly number[]): T {
    let total = 0;
    for (const w of weights) total += w;
    let roll = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      roll -= weights[i] ?? 0;
      if (roll < 0) return items[i] as T;
    }
    return items[items.length - 1] as T;
  }

  snapshot(): RngState {
    return { ...this.s };
  }
}
