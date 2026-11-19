import type { RegionId, Tag } from '@brumeterre/game-core';

export const colors = {
  bg: '#14161F',
  surface: '#1E2130',
  surfaceAlt: '#272B3D',
  border: '#343A52',
  text: '#ECE8DD',
  textDim: '#A39F95',
  accent: '#E8B65A',
  accentText: '#1A1405',
  good: '#6FCF97',
  bad: '#EB6F6F',
  hpHero: '#6FCF97',
  hpEnemy: '#EB6F6F',
  shield: '#7FB8F0',
} as const;

export const regionColors: Record<RegionId, string> = {
  forest: '#4E9A6B',
  volcano: '#D1603D',
  coast: '#4FA3C7',
};

export const tagColors: Record<Tag, string> = {
  fire: '#E8754A',
  ice: '#6FB7E8',
  melee: '#C9A26B',
  buff: '#B38BE0',
  burst: '#E85A7A',
  support: '#6FCF97',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
export const radius = { sm: 8, md: 12, lg: 18 } as const;
export const font = { sm: 13, md: 15, lg: 18, xl: 24, xxl: 30 } as const;
