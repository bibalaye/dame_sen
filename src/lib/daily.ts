/**
 * Le Défi du Jour.
 *
 * Une position, la même pour tout le monde, renouvelée chaque jour : trouver la
 * rafle qui prend le plus de pièces. Trois essais, un résultat qui se recopie
 * en quelques caractères, et une série de jours à ne pas casser.
 *
 * C'est ce qui rend un jeu à deux visitable seul — le principal problème
 * d'audience de ce genre de jeu.
 *
 * La position est calculée à partir du numéro du jour, sans aucun serveur :
 * deux joueurs qui ouvrent la page le même jour tombent sur le même puzzle.
 */

import {
  BOARD_SIZE,
  createGame,
  isInside,
  legalMoves,
  playMove,
  type Board,
  type GameState,
  type Move,
  type Piece,
  type Position,
  type Square,
} from './engine.ts';

/** Premier jour du calendrier des défis. */
const EPOCH = Date.UTC(2026, 0, 1);
const DAY_MS = 24 * 60 * 60 * 1000;

export const MAX_ATTEMPTS = 3;

/** Numéro du défi pour une date donnée, à partir du 1ᵉʳ janvier 2026. */
export const dailyNumber = (date: Date = new Date()): number => {
  const utc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.max(1, Math.floor((utc - EPOCH) / DAY_MS) + 1);
};

/** Générateur déterministe : le même numéro donne toujours le même puzzle. */
const seededRandom = (seed: number): (() => number) => {
  let state = (seed * 2654435761) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const pick = <T,>(items: readonly T[], random: () => number): T =>
  items[Math.floor(random() * items.length)];

const DIRECTIONS: readonly Position[] = [
  { row: 1, col: 0 },
  { row: -1, col: 0 },
  { row: 0, col: 1 },
  { row: 0, col: -1 },
];

/**
 * Longueur de la plus longue rafle possible dans cette position.
 *
 * C'est la réponse attendue du joueur : le puzzle est réussi quand il prend
 * autant de pièces que cette valeur.
 */
export const maxCaptureChain = (state: GameState): number => {
  const captures = legalMoves(state).filter(
    (move) => move.captureRow !== undefined,
  );
  if (captures.length === 0) return 0;

  let best = 0;
  for (const move of captures) {
    const next = playMove(state, move);
    if (next === state) continue;
    // Tant que le trait ne change pas, la rafle se poursuit.
    const depth =
      next.currentPlayer === state.currentPlayer ? 1 + maxCaptureChain(next) : 1;
    if (depth > best) best = depth;
  }
  return best;
};

export interface DailyPuzzle {
  readonly number: number;
  readonly board: Board;
  /** Nombre de prises de la meilleure rafle : l'objectif à égaler. */
  readonly target: number;
}

const emptyRows = (): Square[][] =>
  Array.from({ length: BOARD_SIZE }, () => Array<Square>(BOARD_SIZE).fill(null));

const whitePawn: Piece = { player: 'white', isKing: false };
const blackPawn: Piece = { player: 'black', isKing: false };

/**
 * Construit une position en traçant d'abord le chemin de la rafle, puis en
 * ajoutant quelques pièces pour brouiller la lecture. Générer au hasard et
 * espérer une rafle ne marcherait pas : les positions intéressantes sont rares.
 */
const buildCandidate = (random: () => number, wantedChain: number): Board | null => {
  const board = emptyRows();

  // Le pion qui va rafler ne peut pas partir de la rangée de promotion : il y
  // serait déjà dame. Il peut en revanche y arriver en cours de rafle.
  let row = Math.floor(random() * (BOARD_SIZE - 1));
  let col = Math.floor(random() * BOARD_SIZE);
  board[row][col] = whitePawn;

  const start = { row, col };
  let placed = 0;

  for (let step = 0; step < wantedChain; step++) {
    // Un pion blanc ne prend jamais vers l'arrière : on garde les directions
    // qu'il pourrait réellement emprunter.
    const usable = DIRECTIONS.filter((dir) => dir.row !== -1).filter((dir) => {
      const overRow = row + dir.row;
      const overCol = col + dir.col;
      const landRow = overRow + dir.row;
      const landCol = overCol + dir.col;
      return (
        isInside(overRow, overCol) &&
        isInside(landRow, landCol) &&
        board[overRow][overCol] === null &&
        board[landRow][landCol] === null &&
        // Un pion noir posé sur la rangée 0 serait déjà une dame.
        overRow !== 0
      );
    });

    if (usable.length === 0) break;

    const dir = pick(usable, random);
    board[row + dir.row][col + dir.col] = blackPawn;
    row += dir.row * 2;
    col += dir.col * 2;
    placed++;
  }

  if (placed < 2) return null;

  // Une seconde pièce blanche, à l'écart : sans elle, le survivant unique
  // passerait dame d'office et changerait la nature du puzzle.
  const free: Position[] = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c]) continue;
      const touchesBlack = DIRECTIONS.some((dir) => {
        const nr = r + dir.row;
        const nc = c + dir.col;
        return isInside(nr, nc) && board[nr][nc]?.player === 'black';
      });
      const isPath = r === start.row && c === start.col;
      // Idem pour un pion blanc : il n'atteint jamais la dernière rangée sans
      // être promu.
      const wouldBePromoted = r === BOARD_SIZE - 1;
      if (!touchesBlack && !isPath && !wouldBePromoted) {
        free.push({ row: r, col: c });
      }
    }
  }

  if (free.length === 0) return null;
  const witness = pick(free, random);
  board[witness.row][witness.col] = whitePawn;

  // Quelques pièces noires de plus, sans contact avec le chemin, pour que la
  // solution ne saute pas aux yeux.
  const decoys = Math.floor(random() * 3);
  for (let i = 0; i < decoys; i++) {
    const spots = free.filter(
      (spot) =>
        board[spot.row][spot.col] === null &&
        spot.row !== 0 &&
        !DIRECTIONS.some((dir) => {
          const nr = spot.row + dir.row;
          const nc = spot.col + dir.col;
          return isInside(nr, nc) && board[nr][nc]?.player === 'white';
        }),
    );
    if (spots.length === 0) break;
    const spot = pick(spots, random);
    board[spot.row][spot.col] = blackPawn;
  }

  return board;
};

export const puzzleState = (board: Board): GameState => ({
  ...createGame('classic'),
  board,
  currentPlayer: 'white',
  positionCounts: {},
});

/** Le puzzle du jour. Le même numéro rend toujours la même position. */
export const dailyPuzzle = (number: number = dailyNumber()): DailyPuzzle => {
  const random = seededRandom(number);

  for (let attempt = 0; attempt < 400; attempt++) {
    const wanted = 2 + Math.floor(random() * 2);
    const board = buildCandidate(random, wanted);
    if (!board) continue;

    const target = maxCaptureChain(puzzleState(board));
    if (target >= 2) {
      return { number, board, target };
    }
  }

  // Repli : une position simple, garantie jouable, plutôt qu'aucun défi.
  const board = emptyRows();
  board[2][0] = whitePawn;
  board[2][1] = blackPawn;
  board[2][3] = blackPawn;
  board[0][4] = whitePawn;
  return { number, board, target: maxCaptureChain(puzzleState(board)) };
};

export interface DailyResult {
  readonly number: number;
  /** Prises réalisées à chaque essai, dans l'ordre. */
  readonly attempts: readonly number[];
  readonly target: number;
  readonly solved: boolean;
}

/**
 * Le texte qu'on colle dans la conversation. Il montre la performance sans
 * jamais révéler la position ni la solution.
 */
export const formatShare = (result: DailyResult, streak: number): string => {
  const lines = result.attempts.map((taken) => {
    const hit = '🟡'.repeat(Math.min(taken, result.target));
    const miss = '⬛'.repeat(Math.max(0, result.target - taken));
    return hit + miss;
  });

  const score = result.solved ? `${result.attempts.length}/${MAX_ATTEMPTS}` : 'X';
  const header = `Dame Sen · Défi n°${result.number} · ${score}`;
  const footer = streak > 1 ? `Série : ${streak} jours` : '';

  return [header, ...lines, footer].filter(Boolean).join('\n');
};

// --- Conservation locale de la série ---------------------------------------

const STORAGE_KEY = 'dame-sen:daily';

export interface DailyProgress {
  /** Dernier défi terminé. */
  readonly lastNumber: number;
  readonly streak: number;
  readonly solvedCount: number;
}

const EMPTY_PROGRESS: DailyProgress = {
  lastNumber: 0,
  streak: 0,
  solvedCount: 0,
};

export const loadProgress = (): DailyProgress => {
  if (typeof window === 'undefined') return EMPTY_PROGRESS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_PROGRESS;
    const parsed = JSON.parse(raw) as Partial<DailyProgress>;
    return {
      lastNumber: Number(parsed.lastNumber) || 0,
      streak: Number(parsed.streak) || 0,
      solvedCount: Number(parsed.solvedCount) || 0,
    };
  } catch {
    // Stockage indisponible ou contenu illisible : on repart de zéro.
    return EMPTY_PROGRESS;
  }
};

/**
 * Met à jour la série. Un jour manqué la remet à zéro ; rejouer le même jour ne
 * la fait pas monter deux fois.
 */
export const applyResult = (
  progress: DailyProgress,
  number: number,
  solved: boolean,
): DailyProgress => {
  if (progress.lastNumber === number) return progress;

  const continues = solved && progress.lastNumber === number - 1;
  return {
    lastNumber: number,
    streak: solved ? (continues ? progress.streak + 1 : 1) : 0,
    solvedCount: progress.solvedCount + (solved ? 1 : 0),
  };
};

export const saveProgress = (progress: DailyProgress): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Sans stockage, la série ne survit pas à la session : sans conséquence.
  }
};

export type { Move };
