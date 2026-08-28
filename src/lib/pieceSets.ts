/**
 * Jeux de pions.
 *
 * Un jeu de pions fournit deux visuels opposés : le camp clair et le camp
 * sombre aux dames, les croix et les ronds au morpion. Le choix vaut pour les
 * deux jeux, et se conserve d'une session à l'autre.
 *
 * Les six premiers jeux ne différaient que par la couleur : six disques, six
 * fois la même silhouette. On ne choisissait pas une pièce, on choisissait une
 * teinte — et rien ne donnait envie d'en viser une autre. Chaque jeu repose
 * désormais sur une forme qui lui est propre, reconnaissable à la taille où le
 * plateau l'affiche.
 *
 * La rareté n'est pas décorative : elle dit d'un coup d'œil ce qui est à portée
 * et ce qui se mérite, ce qu'un prix seul ne fait pas.
 */

import type { Rarity } from './rarity.ts';

export type PieceSetId =
  // Les six premiers gardent leur identifiant : des joueurs les possèdent déjà,
  // et le renommer effacerait ce qu'ils ont acquis.
  | 'cauri'
  | 'sabar'
  | 'teranga'
  | 'baobab'
  | 'donjon'
  | 'jetons'
  | 'sable'
  | 'village'
  | 'quilles'
  | 'pirogue'
  | 'lutte'
  | 'goree'
  | 'ter'
  | 'drapeaux'
  | 'casino'
  | 'envol';

export interface PieceSet {
  readonly id: PieceSetId;
  readonly name: string;
  readonly detail: string;
  readonly rarity: Rarity;
  readonly price: number;
  /** Image du camp qui ouvre la partie : blancs aux dames, croix au morpion. */
  readonly light: string;
  /** Image du camp adverse. */
  readonly dark: string;
  /** Version « dame » de chaque camp : la pièce empilée du jeu d'origine. */
  readonly lightKing: string;
  readonly darkKing: string;
}

const DIR = '/assets/pieces';

/** Décrit un jeu à partir d'une forme et de deux couleurs opposées. */
const jeu = (
  id: PieceSetId,
  name: string,
  detail: string,
  rarity: Rarity,
  price: number,
  forme: string,
  clair: string,
  sombre: string,
): PieceSet => ({
  id,
  name,
  detail,
  rarity,
  price,
  light: `${DIR}/${forme}-${clair}.png`,
  dark: `${DIR}/${forme}-${sombre}.png`,
  lightKing: `${DIR}/${forme}-${clair}-king.png`,
  darkKing: `${DIR}/${forme}-${sombre}-king.png`,
});

export const PIECE_SETS: readonly PieceSet[] = [
  // --- Commun : de quoi jouer tout de suite -------------------------------
  jeu(
    'cauri',
    'Classique',
    'Le damier de toujours, clair contre sombre',
    'commun',
    0,
    'disc',
    'white',
    'black',
  ),
  jeu('sabar', 'Sabar', 'Rouge et bleu, comme les tambours', 'commun', 150, 'disc', 'red', 'blue'),
  jeu('teranga', 'Teranga', 'Le vert et le jaune du pays', 'commun', 250, 'disc', 'yellow', 'green'),
  jeu('sable', 'Sable', 'Des pions taillés, sobres', 'commun', 250, 'pawn', 'white', 'black'),

  // --- Rare : la première vraie récompense ---------------------------------
  jeu('baobab', 'Baobab', 'Blanc contre violet, massif', 'rare', 500, 'pawn', 'white', 'purple'),
  jeu('jetons', 'Jetons', 'Des jetons de table', 'rare', 500, 'chip', 'redwhite', 'blackwhite'),
  jeu('village', 'Village', 'Des cases au toit pointu', 'rare', 700, 'case', 'yellow', 'green'),
  jeu('quilles', 'Quilles', 'Des silhouettes debout', 'rare', 700, 'quille', 'white', 'black'),
  jeu('donjon', 'Donjon', 'Des tours de château', 'rare', 900, 'tower', 'white', 'black'),

  // --- Épique : on les remarque de l'autre bout de la table ----------------
  jeu('pirogue', 'Pirogues', 'Les barques des pêcheurs', 'epique', 1400, 'pirogue', 'blue', 'red'),
  jeu('lutte', 'Lutteurs', 'L’arène, bras écartés', 'epique', 1400, 'lutteur', 'red', 'blue'),
  jeu('goree', 'Gorée', 'Les tours crénelées de l’île', 'epique', 1800, 'fort', 'white', 'black'),
  jeu('casino', 'Tapis vert', 'Jetons verts contre bleus', 'epique', 1800, 'chip', 'greenwhite', 'bluewhite'),

  // --- Légendaire : le but qu'on se fixe -----------------------------------
  jeu('ter', 'Le TER', 'Deux trains qui se croisent', 'legendaire', 3000, 'train', 'blue', 'red'),
  jeu('drapeaux', 'Fanions', 'Planter son drapeau', 'legendaire', 3000, 'fanion', 'green', 'yellow'),
  jeu('envol', 'Envol', 'Deux appareils en vol', 'legendaire', 4000, 'avion', 'white', 'red'),
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
