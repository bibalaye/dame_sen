/**
 * Jeux de pions.
 *
 * Les pièces étaient dessinées en CSS : deux dégradés radiaux et un anneau. On
 * passe à de vraies images, et le joueur choisit avec quoi il joue — c'est la
 * personnalisation la moins coûteuse et la plus visible d'un jeu de plateau.
 *
 * Un jeu de pions fournit deux visuels opposés : le camp clair et le camp
 * sombre aux dames, les croix et les ronds au morpion. Le choix vaut pour les
 * deux jeux, et se conserve d'une session à l'autre.
 */

export type PieceSetId =
  | 'cauri'
  | 'sabar'
  | 'teranga'
  | 'baobab'
  | 'donjon'
  | 'jetons';

export interface PieceSet {
  readonly id: PieceSetId;
  readonly name: string;
  readonly detail: string;
  /** Image du camp qui ouvre la partie : blancs aux dames, croix au morpion. */
  readonly light: string;
  /** Image du camp adverse. */
  readonly dark: string;
  /** Version « dame » de chaque camp : la pièce empilée du jeu d'origine. */
  readonly lightKing: string;
  readonly darkKing: string;
}

const PIECE_DIR = '/assets/pieces';

export const PIECE_SETS: readonly PieceSet[] = [
  {
    id: 'cauri',
    name: 'Cauris',
    detail: 'Le jeu traditionnel, clair contre sombre',
    light: `${PIECE_DIR}/disc-white.png`,
    dark: `${PIECE_DIR}/disc-black.png`,
    lightKing: `${PIECE_DIR}/disc-white-king.png`,
    darkKing: `${PIECE_DIR}/disc-black-king.png`,
  },
  {
    id: 'sabar',
    name: 'Sabar',
    detail: 'Rouge et bleu, comme les tambours',
    light: `${PIECE_DIR}/disc-red.png`,
    dark: `${PIECE_DIR}/disc-blue.png`,
    lightKing: `${PIECE_DIR}/disc-red-king.png`,
    darkKing: `${PIECE_DIR}/disc-blue-king.png`,
  },
  {
    id: 'teranga',
    name: 'Teranga',
    detail: 'Vert et jaune',
    light: `${PIECE_DIR}/disc-yellow.png`,
    dark: `${PIECE_DIR}/disc-green.png`,
    lightKing: `${PIECE_DIR}/disc-yellow-king.png`,
    darkKing: `${PIECE_DIR}/disc-green-king.png`,
  },
  {
    id: 'baobab',
    name: 'Baobab',
    detail: 'Des pions taillés, blanc contre violet',
    light: `${PIECE_DIR}/pawn-white.png`,
    dark: `${PIECE_DIR}/pawn-purple.png`,
    lightKing: `${PIECE_DIR}/pawn-white-king.png`,
    darkKing: `${PIECE_DIR}/pawn-purple-king.png`,
  },
  {
    id: 'donjon',
    name: 'Donjon',
    detail: 'Des tours de château',
    light: `${PIECE_DIR}/tower-white.png`,
    dark: `${PIECE_DIR}/tower-black.png`,
    lightKing: `${PIECE_DIR}/tower-white-king.png`,
    darkKing: `${PIECE_DIR}/tower-black-king.png`,
  },
  {
    id: 'jetons',
    name: 'Jetons',
    detail: 'Des jetons de table',
    light: `${PIECE_DIR}/chip-redwhite.png`,
    dark: `${PIECE_DIR}/chip-blackwhite.png`,
    lightKing: `${PIECE_DIR}/chip-redwhite-king.png`,
    darkKing: `${PIECE_DIR}/chip-blackwhite-king.png`,
  },
];

export const DEFAULT_PIECE_SET: PieceSetId = 'cauri';

export const findPieceSet = (id: PieceSetId | null | undefined): PieceSet =>
  PIECE_SETS.find((set) => set.id === id) ??
  PIECE_SETS.find((set) => set.id === DEFAULT_PIECE_SET)!;

/** Toutes les images d'un jeu de pions, à précharger avant la première partie. */
export const pieceSetImages = (set: PieceSet): readonly string[] => [
  set.light,
  set.dark,
  set.lightKing,
  set.darkKing,
];

// --- Préférence conservée ---------------------------------------------------

const STORAGE_KEY = 'dame-sen:pieces';

export const loadPieceSet = (): PieceSetId => {
  if (typeof window === 'undefined') return DEFAULT_PIECE_SET;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return PIECE_SETS.some((set) => set.id === raw)
      ? (raw as PieceSetId)
      : DEFAULT_PIECE_SET;
  } catch {
    // Stockage indisponible : on joue avec le jeu par défaut.
    return DEFAULT_PIECE_SET;
  }
};

export const savePieceSet = (id: PieceSetId): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Sans stockage, le choix vaut pour la session en cours.
  }
};
