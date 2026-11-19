import { describe, expect, it } from 'vitest';
import { GAME_CORE_VERSION } from '../src/index';

describe('game-core', () => {
  it('exposes a version', () => {
    expect(GAME_CORE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
