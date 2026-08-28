/**
 * Thèmes de plateau.
 *
 * Le damier occupe la moitié de ce que le joueur regarde pendant une partie :
 * c'est la personnalisation la plus visible après les pions, et la moins
 * coûteuse à produire — un thème n'est qu'un jeu de couleurs.
 *
 * Chaque thème redéfinit les mêmes variables que le thème par défaut, ce qui
 * lui permet de s'appliquer sans toucher au dessin du plateau. Les couleurs
 * d'état (dernier coup, sélection, prise) restent communes : les changer
 * rendrait le jeu illisible d'un thème à l'autre.
 */

import type { Rarity } from './rarity.ts';

export type BoardThemeId =
  | 'bois'
  | 'sable'
  | 'ebene'
  | 'laterite'
  | 'pierre'
  | 'wax'
  | 'nuit'
  | 'laiton';

export interface BoardTheme {
  readonly id: BoardThemeId;
  readonly name: string;
  readonly detail: string;
  readonly rarity: Rarity;
  readonly price: number;
  /** Case claire du damier. */
  readonly squareLight: string;
  /** Case sombre du damier. */
  readonly squareDark: string;
  /** Cadre du plateau, en dégradé de ces deux teintes. */
  readonly frameLight: string;
  readonly frameDark: string;
}

export const BOARD_THEMES: readonly BoardTheme[] = [
  {
    id: 'bois',
    name: 'Bois',
    detail: 'Le plateau de toujours',
    rarity: 'commun',
    price: 0,
    squareLight: '#cdb48d',
    squareDark: '#bfa176',
    frameLight: '#8a6440',
    frameDark: '#5a3d24',
  },
  {
    id: 'sable',
    name: 'Sable',
    detail: 'Clair, comme une plage au matin',
    rarity: 'commun',
    price: 200,
    squareLight: '#e8d9b8',
    squareDark: '#d4c096',
    frameLight: '#b09263',
    frameDark: '#7d6540',
  },
  {
    id: 'ebene',
    name: 'Ébène',
    detail: 'Bois sombre, veines profondes',
    rarity: 'rare',
    price: 600,
    squareLight: '#6b5a4a',
    squareDark: '#4a3d32',
    frameLight: '#3a2f26',
    frameDark: '#221b16',
  },
  {
    id: 'laterite',
    name: 'Latérite',
    detail: 'La terre rouge des pistes',
    rarity: 'rare',
    price: 800,
    squareLight: '#c98d63',
    squareDark: '#a96a45',
    frameLight: '#8a4f30',
    frameDark: '#5e3520',
  },
  {
    id: 'pierre',
    name: 'Pierre',
    detail: 'Gris taillé, sans fioriture',
    rarity: 'rare',
    price: 800,
    squareLight: '#b8b5ae',
    squareDark: '#9a978f',
    frameLight: '#6e6b65',
    frameDark: '#4a4844',
  },
  {
    id: 'wax',
    name: 'Wax',
    detail: 'Les couleurs du pagne',
    rarity: 'epique',
    price: 1600,
    squareLight: '#e5b93c',
    squareDark: '#1f7a54',
    frameLight: '#b8791d',
    frameDark: '#0f4a33',
  },
  {
    id: 'nuit',
    name: 'Nuit',
    detail: 'Bleu profond, pour jouer tard',
    rarity: 'epique',
    price: 1600,
    squareLight: '#33456b',
    squareDark: '#22304d',
    frameLight: '#1a2338',
    frameDark: '#0e1422',
  },
  {
    id: 'laiton',
    name: 'Laiton',
    detail: 'Doré sur brun, la table des grands soirs',
    rarity: 'legendaire',
    price: 3500,
    squareLight: '#d9ac52',
    squareDark: '#8a6a2c',
    frameLight: '#6b4f1c',
    frameDark: '#3d2c0d',
  },
];

export const DEFAULT_BOARD_THEME: BoardThemeId = 'bois';

export const findBoardTheme = (id: BoardThemeId | null | undefined): BoardTheme =>
  BOARD_THEMES.find((theme) => theme.id === id) ??
  BOARD_THEMES.find((theme) => theme.id === DEFAULT_BOARD_THEME)!;

/**
 * Les variables à poser sur le conteneur du plateau. Un thème s'applique ainsi
 * localement, sans toucher au thème clair ou sombre de toute l'application.
 */
export const boardStyle = (theme: BoardTheme): Record<string, string> => ({
  '--square-light': theme.squareLight,
  '--square-dark': theme.squareDark,
  '--wood-light': theme.frameLight,
  '--wood-dark': theme.frameDark,
});

// --- Préférence conservée ---------------------------------------------------

const STORAGE_KEY = 'dame-sen:board';

export const loadBoardTheme = (): BoardThemeId => {
  if (typeof window === 'undefined') return DEFAULT_BOARD_THEME;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return BOARD_THEMES.some((theme) => theme.id === raw)
      ? (raw as BoardThemeId)
      : DEFAULT_BOARD_THEME;
  } catch {
    return DEFAULT_BOARD_THEME;
  }
};

export const saveBoardTheme = (id: BoardThemeId): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Sans stockage, le choix vaut pour la session en cours.
  }
};
