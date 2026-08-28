/**
 * Moteur du morpion.
 *
 * Même parti pris que celui des dames : aucune dépendance à React, aucune
 * mutation, tout est calculable et testable hors de l'interface.
 *
 * Le morpion étant un jeu résolu, une IA parfaite ne perd jamais — au mieux on
 * lui arrache un nul. C'est pour cela que les niveaux faibles ne sont pas une
 * recherche bridée mais des adversaires qui laissent volontairement passer des
 * occasions : sans cela, il n'y aurait rien à jouer.
 */

export type Mark = 'X' | 'O';
export type Cell = Mark | null;

/** Grille à plat : indices 0 à 8, de haut en bas et de gauche à droite. */
export type Grid = readonly Cell[];

export type Line = readonly [number, number, number];

export const LINES: readonly Line[] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export type MorpionStatus =
  | { readonly kind: 'playing' }
  | { readonly kind: 'win'; readonly winner: Mark; readonly line: Line }
  | { readonly kind: 'draw' };

export interface MorpionState {
  readonly grid: Grid;
  readonly current: Mark;
  readonly status: MorpionStatus;
  readonly lastMove: number | null;
}

export const other = (mark: Mark): Mark => (mark === 'X' ? 'O' : 'X');

const EMPTY_GRID: Grid = Array<Cell>(9).fill(null);

export const createMorpion = (first: Mark = 'X'): MorpionState => ({
  grid: EMPTY_GRID,
  current: first,
  status: { kind: 'playing' },
  lastMove: null,
});

/** La ligne gagnante d'une grille, s'il y en a une. */
export const findWinningLine = (
  grid: Grid,
): { mark: Mark; line: Line } | null => {
  for (const line of LINES) {
    const [a, b, c] = line;
    const mark = grid[a];
    if (mark && mark === grid[b] && mark === grid[c]) {
      return { mark, line };
    }
  }
  return null;
};

export const availableMoves = (state: MorpionState): number[] => {
  if (state.status.kind !== 'playing') return [];
  const moves: number[] = [];
  for (let i = 0; i < 9; i++) {
    if (!state.grid[i]) moves.push(i);
  }
  return moves;
};

const statusOf = (grid: Grid): MorpionStatus => {
  const won = findWinningLine(grid);
  if (won) return { kind: 'win', winner: won.mark, line: won.line };
  return grid.every((cell) => cell !== null) ? { kind: 'draw' } : { kind: 'playing' };
};

/**
 * Joue une case. Un coup illégal — case occupée, hors grille, partie finie —
 * renvoie l'état inchangé, comme le moteur des dames.
 */
export const playMorpion = (state: MorpionState, index: number): MorpionState => {
  if (state.status.kind !== 'playing') return state;
  if (index < 0 || index > 8 || state.grid[index]) return state;

  const grid = state.grid.slice();
  grid[index] = state.current;

  return {
    grid,
    current: other(state.current),
    status: statusOf(grid),
    lastMove: index,
  };
};

// --- Adversaire -------------------------------------------------------------

export type MorpionDifficulty = 'easy' | 'medium' | 'hard';

export interface MorpionOpponent {
  readonly id: MorpionDifficulty;
  readonly name: string;
  readonly tagline: string;
}

export const MORPION_OPPONENTS: readonly MorpionOpponent[] = [
  { id: 'easy', name: 'Le petit', tagline: 'Joue au hasard, ou presque' },
  { id: 'medium', name: 'La cousine', tagline: 'Bloque, mais rate des coups' },
  { id: 'hard', name: 'Le vieux', tagline: 'Imbattable — visez le nul' },
];

/**
 * Recherche exhaustive. La grille ne compte que neuf cases : l'arbre entier
 * tient largement, inutile d'élaguer ou de limiter la profondeur.
 *
 * Le score tient compte du nombre de coups joués pour préférer gagner vite et
 * perdre tard — sans quoi l'IA laisse traîner des positions gagnées.
 */
const score = (state: MorpionState, me: Mark, depth: number): number => {
  if (state.status.kind === 'win') {
    return state.status.winner === me ? 10 - depth : depth - 10;
  }
  if (state.status.kind === 'draw') return 0;

  const moves = availableMoves(state);
  const maximizing = state.current === me;
  let best = maximizing ? -Infinity : Infinity;

  for (const move of moves) {
    const value = score(playMorpion(state, move), me, depth + 1);
    best = maximizing ? Math.max(best, value) : Math.min(best, value);
  }

  return best;
};

/** Le meilleur coup possible, sans concession. */
export const perfectMove = (state: MorpionState): number | null => {
  const moves = availableMoves(state);
  if (moves.length === 0) return null;

  const me = state.current;
  let best = moves[0];
  let bestScore = -Infinity;

  for (const move of moves) {
    const value = score(playMorpion(state, move), me, 0);
    if (value > bestScore) {
      bestScore = value;
      best = move;
    }
  }

  return best;
};

/** Un coup qui gagne immédiatement, s'il en existe un. */
const winningMove = (state: MorpionState, mark: Mark): number | null => {
  for (const move of availableMoves(state)) {
    const grid = state.grid.slice();
    grid[move] = mark;
    const won = findWinningLine(grid);
    if (won && won.mark === mark) return move;
  }
  return null;
};

export const findBestMorpionMove = (
  state: MorpionState,
  difficulty: MorpionDifficulty,
  random: () => number = Math.random,
): number | null => {
  const moves = availableMoves(state);
  if (moves.length === 0) return null;

  if (difficulty === 'hard') return perfectMove(state);

  const me = state.current;

  // Les deux niveaux faibles voient le coup gagnant et la menace adverse, mais
  // ne construisent aucun plan : c'est ce qui les rend battables sans les
  // rendre absurdes.
  const takeWin = winningMove(state, me);
  if (takeWin !== null) return takeWin;

  const blunderRate = difficulty === 'easy' ? 0.45 : 0.15;
  if (random() < blunderRate) {
    return moves[Math.floor(random() * moves.length)];
  }

  const block = winningMove(state, other(me));
  if (block !== null) return block;

  // À défaut, le centre puis les coins : les cases qui appartiennent au plus
  // grand nombre de lignes.
  const preference = [4, 0, 2, 6, 8, 1, 3, 5, 7];
  return preference.find((cell) => moves.includes(cell)) ?? moves[0];
};

/** Délai de réflexion, pour que l'adversaire ne réponde pas instantanément. */
export const morpionThinkingDelay = (random: () => number = Math.random): number =>
  Math.round(320 + random() * 420);
