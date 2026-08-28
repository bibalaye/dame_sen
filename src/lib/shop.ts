/**
 * La boutique.
 *
 * Un seul catalogue rassemble ce qui s'achète : pions, plateaux,
 * fonctionnalités, cadres et titres. L'inventaire d'un joueur est donc une
 * simple liste d'identifiants, quelle que soit la catégorie — sans quoi il
 * faudrait une colonne par famille d'articles, et une migration à chaque
 * nouvelle idée.
 *
 * Les identifiants sont préfixés par leur famille. Ce n'est pas de la
 * décoration : « sable » désigne à la fois un jeu de pions et un plateau, et
 * deux articles ne peuvent pas partager une clé d'inventaire.
 *
 * Règle qui ne souffre pas d'exception : rien de ce qui s'achète ne change une
 * règle du jeu ni ne donne un avantage sur un adversaire humain. Les
 * fonctionnalités vendues n'agissent qu'en solo, contre la machine.
 */

import { BOARD_THEMES, type BoardThemeId } from './boards.ts';
import { PIECE_SETS, type PieceSetId } from './pieceSets.ts';
import { compareByRarity, type Rarity } from './rarity.ts';

export type ItemKind = 'pieces' | 'board' | 'feature' | 'frame' | 'title';

/** Identifiant d'inventaire : « famille:article ». */
export type ItemId = string;

export interface ShopItem {
  readonly id: ItemId;
  readonly kind: ItemKind;
  readonly name: string;
  readonly detail: string;
  readonly rarity: Rarity;
  readonly price: number;
}

export const itemId = (kind: ItemKind, local: string): ItemId => `${kind}:${local}`;

/** Partie locale d'un identifiant : « pieces:sabar » donne « sabar ». */
export const localId = (id: ItemId): string => id.slice(id.indexOf(':') + 1);

export const kindOf = (id: ItemId): ItemKind => id.slice(0, id.indexOf(':')) as ItemKind;

export const KIND_LABELS: Readonly<Record<ItemKind, string>> = {
  pieces: 'Pions',
  board: 'Plateaux',
  feature: 'Fonctions',
  frame: 'Cadres',
  title: 'Titres',
};

/**
 * Ordre des rayons. Les pions d'abord : c'est ce qu'on voit le plus, et donc ce
 * qui donne envie d'ouvrir la boutique une deuxième fois.
 */
export const KIND_ORDER: readonly ItemKind[] = [
  'pieces',
  'board',
  'frame',
  'title',
  'feature',
];

// --- Fonctionnalités ---------------------------------------------------------

export type FeatureId = 'indices' | 'retour';

/**
 * Ce que chaque fonctionnalité change réellement. Aucune ne s'applique en
 * ligne : elles se désactivent d'elles-mêmes dès qu'un adversaire humain est en
 * face, sans quoi la boutique déciderait des parties.
 */
export const FEATURES: ReadonlyArray<ShopItem & { readonly feature: FeatureId }> = [
  {
    id: itemId('feature', 'indices'),
    kind: 'feature',
    feature: 'indices',
    name: 'Carnet d’indices',
    detail: 'Six indices par partie au lieu de trois. Solo uniquement.',
    rarity: 'rare',
    price: 600,
  },
  {
    id: itemId('feature', 'retour'),
    kind: 'feature',
    feature: 'retour',
    name: 'Reprendre un coup',
    detail: 'Annuler son dernier coup contre la machine. Solo uniquement.',
    rarity: 'epique',
    price: 1200,
  },
];

// --- Cadres ------------------------------------------------------------------

export type FrameId = 'laiton' | 'foret' | 'indigo' | 'braise';

export const FRAMES: ReadonlyArray<ShopItem & { readonly color: string }> = [
  {
    id: itemId('frame', 'laiton'),
    kind: 'frame',
    color: 'var(--brass)',
    name: 'Cadre laiton',
    detail: 'Un liseré doré autour de votre initiale',
    rarity: 'rare',
    price: 400,
  },
  {
    id: itemId('frame', 'foret'),
    kind: 'frame',
    color: 'var(--green)',
    name: 'Cadre forêt',
    detail: 'Le vert du drapeau',
    rarity: 'rare',
    price: 400,
  },
  {
    id: itemId('frame', 'indigo'),
    kind: 'frame',
    color: 'var(--indigo)',
    name: 'Cadre indigo',
    detail: 'Le bleu des teinturières',
    rarity: 'epique',
    price: 1000,
  },
  {
    id: itemId('frame', 'braise'),
    kind: 'frame',
    color: 'var(--red)',
    name: 'Cadre braise',
    detail: 'Rouge vif, difficile à manquer',
    rarity: 'legendaire',
    price: 2500,
  },
];

// --- Titres ------------------------------------------------------------------

export type TitleId = 'teranga' | 'arene' | 'damier' | 'baol' | 'sans-pitie';

export const TITLES: ReadonlyArray<ShopItem & { readonly label: string }> = [
  {
    id: itemId('title', 'teranga'),
    kind: 'title',
    label: 'Lion de la Teranga',
    name: 'Lion de la Teranga',
    detail: 'Affiché sous votre pseudo',
    rarity: 'commun',
    price: 300,
  },
  {
    id: itemId('title', 'arene'),
    kind: 'title',
    label: 'Roi de l’arène',
    name: 'Roi de l’arène',
    detail: 'Affiché sous votre pseudo',
    rarity: 'rare',
    price: 700,
  },
  {
    id: itemId('title', 'damier'),
    kind: 'title',
    label: 'Maître du damier',
    name: 'Maître du damier',
    detail: 'Affiché sous votre pseudo',
    rarity: 'epique',
    price: 1500,
  },
  {
    id: itemId('title', 'baol'),
    kind: 'title',
    label: 'Vieux du Baol',
    name: 'Vieux du Baol',
    detail: 'Affiché sous votre pseudo',
    rarity: 'epique',
    price: 1500,
  },
  {
    id: itemId('title', 'sans-pitie'),
    kind: 'title',
    label: 'Sans pitié',
    name: 'Sans pitié',
    detail: 'Affiché sous votre pseudo',
    rarity: 'legendaire',
    price: 3000,
  },
];

// --- Catalogue ---------------------------------------------------------------

const fromPieceSets: readonly ShopItem[] = PIECE_SETS.map((set) => ({
  id: itemId('pieces', set.id),
  kind: 'pieces' as const,
  name: set.name,
  detail: set.detail,
  rarity: set.rarity,
  price: set.price,
}));

const fromBoards: readonly ShopItem[] = BOARD_THEMES.map((theme) => ({
  id: itemId('board', theme.id),
  kind: 'board' as const,
  name: theme.name,
  detail: theme.detail,
  rarity: theme.rarity,
  price: theme.price,
}));

export const CATALOG: readonly ShopItem[] = [
  ...fromPieceSets,
  ...fromBoards,
  ...FRAMES,
  ...TITLES,
  ...FEATURES,
];

const BY_ID = new Map(CATALOG.map((item) => [item.id, item]));

export const findItem = (id: ItemId): ShopItem | undefined => BY_ID.get(id);

/** Le prix d'un article. Un identifiant inconnu vaut zéro : rien à débiter. */
export const priceOfItem = (id: ItemId): number => BY_ID.get(id)?.price ?? 0;

/** Un rayon, rangé du plus accessible au plus convoité. */
export const itemsOfKind = (kind: ItemKind): readonly ShopItem[] =>
  CATALOG.filter((item) => item.kind === kind).slice().sort(compareByRarity);

/** Ce qui est offert : jamais verrouillé, jamais facturé. */
export const isFree = (id: ItemId): boolean => priceOfItem(id) === 0;

export const FREE_ITEMS: readonly ItemId[] = CATALOG.filter((item) => item.price === 0).map(
  (item) => item.id,
);

/**
 * Reprend un inventaire d'avant les familles, où seuls les jeux de pions
 * s'achetaient et où « cauri » désignait un article sans préfixe. Sans cette
 * reprise, un joueur perdrait tout ce qu'il avait débloqué.
 */
export const migrateItemId = (raw: string): ItemId =>
  raw.includes(':') ? raw : itemId('pieces', raw);

/** N'accepte que ce que cette version du catalogue connaît. */
export const keepKnownItems = (ids: readonly string[]): ItemId[] => {
  const vus = new Set<ItemId>();
  for (const raw of ids) {
    const id = migrateItemId(raw);
    if (BY_ID.has(id)) vus.add(id);
  }
  return [...vus];
};

// --- Sélections courantes ----------------------------------------------------

/**
 * Ce que le joueur porte. Chaque famille dont un seul article s'applique à la
 * fois a son entrée ici ; les fonctionnalités, elles, valent dès qu'on les
 * possède.
 */
export interface Loadout {
  readonly pieces: PieceSetId;
  readonly board: BoardThemeId;
  readonly frame: FrameId | null;
  readonly title: TitleId | null;
}

export const hasFeature = (owned: readonly ItemId[], feature: FeatureId): boolean =>
  owned.includes(itemId('feature', feature));

export const findFrame = (id: FrameId | null | undefined) =>
  FRAMES.find((frame) => localId(frame.id) === id);

export const findTitle = (id: TitleId | null | undefined) =>
  TITLES.find((title) => localId(title.id) === id);

// --- Cadre et titre conservés localement -------------------------------------

const COSMETICS_KEY = 'dame-sen:parure';

/**
 * Les pions et le plateau ont chacun leur clé de longue date ; le cadre et le
 * titre partagent celle-ci. Sans elle, un joueur sans compte perdrait au
 * rechargement ce qu'il vient d'acheter.
 */
export const loadCosmetics = (): Pick<Loadout, 'frame' | 'title'> => {
  if (typeof window === 'undefined') return { frame: null, title: null };
  try {
    const raw = window.localStorage.getItem(COSMETICS_KEY);
    if (!raw) return { frame: null, title: null };

    const parsed = JSON.parse(raw) as { frame?: string; title?: string };
    return {
      frame: findFrame(parsed.frame as FrameId) ? (parsed.frame as FrameId) : null,
      title: findTitle(parsed.title as TitleId) ? (parsed.title as TitleId) : null,
    };
  } catch {
    return { frame: null, title: null };
  }
};

export const saveCosmetics = (loadout: Pick<Loadout, 'frame' | 'title'>): void => {
  try {
    window.localStorage.setItem(
      COSMETICS_KEY,
      JSON.stringify({ frame: loadout.frame, title: loadout.title }),
    );
  } catch {
    // Sans stockage, la parure vaut pour la session en cours.
  }
};
