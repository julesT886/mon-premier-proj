/**
 * Couche de monétisation abstraite (structure seulement, aucun paiement au MVP).
 * Principes : pas de loot box payante, pas de pression artificielle, aucun avantage
 * de combat achetable. Seul l'accélérateur hors ligne touche au gameplay, et
 * uniquement en allongeant le plafond (12 h → 16 h), pas la vitesse.
 */

export const BASE_OFFLINE_CAP_MS = 12 * 60 * 60 * 1000;
export const BOOSTED_OFFLINE_CAP_MS = 16 * 60 * 60 * 1000;

export type ProductKind = 'season_pass' | 'cosmetic' | 'offline_boost';

export interface Product {
  id: string;
  kind: ProductKind;
  /** Palier de prix abstrait, résolu par la boutique de la plateforme. */
  priceTier: 'tier1' | 'tier2' | 'tier3';
  /** Clé i18n du nom affiché. */
  nameKey: string;
}

export const CATALOG: readonly Product[] = [
  { id: 'season_pass_s1', kind: 'season_pass', priceTier: 'tier2', nameKey: 'shop.seasonPass' },
  { id: 'offline_boost', kind: 'offline_boost', priceTier: 'tier1', nameKey: 'shop.offlineBoost' },
  { id: 'cosmetic_mist_cloak', kind: 'cosmetic', priceTier: 'tier1', nameKey: 'shop.mistCloak' },
];

export interface Entitlements {
  seasonPass: { seasonId: string } | null;
  cosmetics: string[];
  offlineBoost: boolean;
}

export function defaultEntitlements(): Entitlements {
  return { seasonPass: null, cosmetics: [], offlineBoost: false };
}

export function offlineCapMs(entitlements: Entitlements): number {
  return entitlements.offlineBoost ? BOOSTED_OFFLINE_CAP_MS : BASE_OFFLINE_CAP_MS;
}

/** Applique un achat validé par la plateforme (idempotent). */
export function grantProduct(entitlements: Entitlements, productId: string): Entitlements {
  const product = CATALOG.find((p) => p.id === productId);
  if (!product) return entitlements;
  switch (product.kind) {
    case 'offline_boost':
      return { ...entitlements, offlineBoost: true };
    case 'season_pass':
      return { ...entitlements, seasonPass: { seasonId: product.id } };
    case 'cosmetic':
      return entitlements.cosmetics.includes(product.id)
        ? entitlements
        : { ...entitlements, cosmetics: [...entitlements.cosmetics, product.id] };
  }
}
