/**
 * Géométrie du plateau de Ludo.
 *
 * Le plateau tient dans une grille de quinze sur quinze : quatre écuries aux
 * coins, une croix de trois cases de large, et le centre où l'on rentre.
 *
 * Le tracé n'est pas écrit case par case. Un plateau de Ludo est invariant par
 * quart de tour : on décrit donc treize cases — le quart du premier joueur —
 * et les trois autres quarts s'en déduisent par rotation. Écrire les
 * cinquante-deux à la main aurait garanti une faute de frappe quelque part, et
 * elle ne se serait vue qu'à l'écran, sur un pion posé de travers.
 *
 * Ce module ne connaît ni React ni les règles : il ne rend que des
 * coordonnées, et se teste donc entièrement.
 */

import {
  HOME_LENGTH,
  LUDO_PLAYERS,
  PIECES_PER_PLAYER,
  START_SQUARE,
  TRACK,
  homeGate,
  type LudoPlayerId,
} from './ludo.ts';

/** Côté de la grille. Quinze est la taille d'un plateau du commerce. */
export const GRID = 15;

export interface Cell {
  readonly row: number;
  readonly col: number;
}

/**
 * Rotation d'un quart de tour vers la droite, autour du centre de la grille.
 * C'est la seule opération dont on ait besoin : tout le plateau en découle.
 */
export const rotate = (cell: Cell): Cell => ({
  row: cell.col,
  col: GRID - 1 - cell.row,
});

const rotateTimes = (cell: Cell, times: number): Cell => {
  let out = cell;
  for (let i = 0; i < times; i++) out = rotate(out);
  return out;
};

/**
 * Le quart du premier joueur : de sa case de départ jusqu'au seuil du suivant.
 *
 * Cinq cases vers le centre, six en remontant le bras, puis les deux du
 * sommet — treize en tout, soit le quart de cinquante-deux.
 */
const FIRST_QUARTER: readonly Cell[] = [
  { row: 6, col: 1 },
  { row: 6, col: 2 },
  { row: 6, col: 3 },
  { row: 6, col: 4 },
  { row: 6, col: 5 },
  { row: 5, col: 6 },
  { row: 4, col: 6 },
  { row: 3, col: 6 },
  { row: 2, col: 6 },
  { row: 1, col: 6 },
  { row: 0, col: 6 },
  { row: 0, col: 7 },
  { row: 0, col: 8 },
];

/** Les cinquante-deux cases du circuit, dans l'ordre où on les parcourt. */
export const TRACK_CELLS: readonly Cell[] = LUDO_PLAYERS.flatMap((player) =>
  FIRST_QUARTER.map((cell) => rotateTimes(cell, player)),
);

/** L'allée du premier joueur : cinq cases menant au centre. */
const FIRST_HOME: readonly Cell[] = [
  { row: 7, col: 1 },
  { row: 7, col: 2 },
  { row: 7, col: 3 },
  { row: 7, col: 4 },
  { row: 7, col: 5 },
];

/** Les cases de l'allée d'un joueur, de l'entrée vers le centre. */
export const homeCells = (player: LudoPlayerId): readonly Cell[] =>
  FIRST_HOME.map((cell) => rotateTimes(cell, player));

/**
 * Les quatre emplacements d'une écurie. Ils sont posés en carré dans le coin,
 * assez écartés pour qu'on distingue quatre pions sans les compter.
 */
const FIRST_STABLE: readonly Cell[] = [
  { row: 1, col: 1 },
  { row: 1, col: 4 },
  { row: 4, col: 1 },
  { row: 4, col: 4 },
];

export const stableCells = (player: LudoPlayerId): readonly Cell[] =>
  FIRST_STABLE.map((cell) => rotateTimes(cell, player));

/** Le coin qu'occupe l'écurie d'un joueur, pour le fond coloré. */
export const stableArea = (
  player: LudoPlayerId,
): { readonly row: number; readonly col: number; readonly size: number } => {
  const coins = [
    { row: 0, col: 0 },
    { row: 0, col: 9 },
    { row: 9, col: 9 },
    { row: 9, col: 0 },
  ];
  return { ...coins[player], size: 6 };
};

/** Le centre, où les pions rentrent. */
export const CENTER: Cell = { row: 7, col: 7 };

/** Où se pose un pion arrivé : légèrement décalé pour les distinguer. */
export const finishedCell = (player: LudoPlayerId, index: number): Cell => {
  // Les quatre pions rentrés se rangent autour du centre, par joueur.
  const offsets: readonly Cell[] = [
    { row: 7, col: 6 },
    { row: 6, col: 7 },
    { row: 7, col: 8 },
    { row: 8, col: 7 },
  ];
  const base = offsets[player];
  return index === 0 ? base : CENTER;
};

/** La case du circuit où chaque joueur pose ses pions en sortant. */
export const startCell = (player: LudoPlayerId): Cell =>
  TRACK_CELLS[START_SQUARE[player]];

/**
 * Vrai si la case du circuit est une case de départ. Elle se teinte de la
 * couleur du joueur, ce qui rend le plateau lisible d'un coup d'œil.
 */
export const startOwner = (square: number): LudoPlayerId | null => {
  for (const player of LUDO_PLAYERS) {
    if (START_SQUARE[player] === square) return player;
  }
  return null;
};

/** Les couleurs des quatre camps, en tokens du thème. */
export const LUDO_COLORS: Readonly<Record<LudoPlayerId, string>> = {
  0: 'var(--red)',
  1: 'var(--green)',
  2: 'var(--indigo)',
  3: 'var(--brass)',
};

export const LUDO_NAMES: Readonly<Record<LudoPlayerId, string>> = {
  0: 'Rouge',
  1: 'Vert',
  2: 'Bleu',
  3: 'Or',
};

/** Vrai si deux cases se touchent par un côté — pas en diagonale. */
const adjacentes = (a: Cell, b: Cell): boolean =>
  Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1;

/**
 * Contrôle de cohérence, utile aux tests et au développement.
 *
 * La dernière vérification est celle qui manquait : le seuil d'un joueur doit
 * toucher l'entrée de son allée. Les règles plaçaient le seuil une case trop
 * loin, et rien ne s'y opposait — le pion bifurquait alors en diagonale,
 * depuis une case qui ne touche pas son allée, tandis que celle qui la touche
 * ne menait nulle part.
 */
export const boardIsSound = (): boolean => {
  if (TRACK_CELLS.length !== TRACK) return false;

  const vues = new Set(TRACK_CELLS.map((c) => `${c.row},${c.col}`));
  if (vues.size !== TRACK) return false;

  for (const player of LUDO_PLAYERS) {
    if (homeCells(player).length !== HOME_LENGTH) return false;
    if (stableCells(player).length !== PIECES_PER_PLAYER) return false;
    if (!adjacentes(TRACK_CELLS[homeGate(player)], homeCells(player)[0])) return false;
  }
  return true;
};
