/**
 * Adversaire artificiel.
 *
 * L'ancienne implémentation simulait ses coups en appelant `setBoard`, une mise
 * à jour d'état React asynchrone : la position n'était jamais modifiée pendant
 * la recherche, et tous les coups candidats recevaient la même note. Ici la
 * recherche travaille sur le moteur pur, où jouer un coup renvoie un nouveau
 * plateau immédiatement exploitable.
 *
 * Algorithme : negamax avec élagage alpha-bêta, approfondissement itératif et
 * budget de temps. Le plateau ne fait que 25 cases, la recherche reste donc
 * bien en deçà de sa limite de temps dans la quasi-totalité des positions.
 */

import {
  BOARD_SIZE,
  countPieces,
  generateMoves,
  legalMoves,
  opponentOf,
  playMove,
  type Board,
  type GameState,
  type Move,
  type Player,
} from './engine.ts';

/** Les quatre adversaires proposés au joueur. */
export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';

interface DifficultyProfile {
  /** Profondeur maximale de recherche, en demi-coups. */
  readonly depth: number;
  /**
   * Probabilité de jouer un coup au hasard plutôt que le meilleur trouvé.
   * C'est ce qui rend les niveaux faibles battables sans les rendre absurdes.
   */
  readonly blunderRate: number;
  /** Budget de recherche par coup, en millisecondes. */
  readonly timeBudgetMs: number;
}

export const DIFFICULTY_PROFILES: Readonly<Record<Difficulty, DifficultyProfile>> = {
  easy: { depth: 1, blunderRate: 0.35, timeBudgetMs: 40 },
  medium: { depth: 3, blunderRate: 0.12, timeBudgetMs: 120 },
  hard: { depth: 5, blunderRate: 0, timeBudgetMs: 300 },
  expert: { depth: 8, blunderRate: 0, timeBudgetMs: 600 },
};

const PAWN_VALUE = 100;
const KING_VALUE = 275;

/** Valeur d'une case selon son éloignement du bord : le centre vaut mieux. */
const CENTER_BONUS: readonly (readonly number[])[] = [
  [0, 2, 3, 2, 0],
  [2, 5, 6, 5, 2],
  [3, 6, 8, 6, 3],
  [2, 5, 6, 5, 2],
  [0, 2, 3, 2, 0],
];

/**
 * Note la position du point de vue d'un joueur, en centièmes de pion.
 *
 * Quatre termes : le matériel, qui domine ; l'avancée des pions vers la rangée
 * de promotion ; l'occupation du centre ; et la mobilité, qui pousse l'IA à ne
 * pas s'enfermer — c'est la façon la plus directe de perdre sur ce plateau.
 */
export const evaluate = (board: Board, player: Player): number => {
  const enemy = opponentOf(player);
  let score = 0;

  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const piece = board[row][col];
      if (!piece) continue;

      const own = piece.player === player;
      const sign = own ? 1 : -1;

      score += sign * (piece.isKing ? KING_VALUE : PAWN_VALUE);
      score += sign * CENTER_BONUS[row][col];

      if (!piece.isKing) {
        // Distance parcourue vers la rangée de promotion adverse.
        const advance = piece.player === 'white' ? row : BOARD_SIZE - 1 - row;
        score += sign * advance * 6;
      }
    }
  }

  const mobility =
    generateMoves(board, player).length - generateMoves(board, enemy).length;
  score += mobility * 3;

  return score;
};

/** Note terminale : perdre vite est pire que perdre tard, et inversement. */
const terminalScore = (state: GameState, player: Player, ply: number): number => {
  if (state.status.kind === 'draw') return 0;
  if (state.status.kind === 'win') {
    return state.status.winner === player ? 100_000 - ply : -100_000 + ply;
  }
  return 0;
};

/** Les prises en premier : l'élagage alpha-bêta y gagne beaucoup. */
const orderMoves = (moves: Move[]): Move[] =>
  [...moves].sort((a, b) => {
    const aCapture = a.captureRow !== undefined ? 1 : 0;
    const bCapture = b.captureRow !== undefined ? 1 : 0;
    return bCapture - aCapture;
  });

interface SearchContext {
  readonly rootPlayer: Player;
  readonly deadline: number;
  nodes: number;
  aborted: boolean;
}

const negamax = (
  state: GameState,
  depth: number,
  ply: number,
  alpha: number,
  beta: number,
  ctx: SearchContext,
): number => {
  ctx.nodes++;

  // On ne teste l'horloge que par paquets : `Date.now()` coûte cher en boucle.
  if ((ctx.nodes & 511) === 0 && Date.now() > ctx.deadline) {
    ctx.aborted = true;
  }

  if (state.status.kind !== 'playing') {
    return terminalScore(state, ctx.rootPlayer, ply);
  }
  if (depth <= 0 || ctx.aborted) {
    return evaluate(state.board, ctx.rootPlayer);
  }

  const moves = orderMoves(legalMoves(state));
  if (moves.length === 0) {
    return evaluate(state.board, ctx.rootPlayer);
  }

  // Le trait ne change pas au milieu d'une rafle : c'est toujours au joueur
  // courant de choisir, donc on maximise sans inverser la fenêtre.
  const maximizing = state.currentPlayer === ctx.rootPlayer;
  let best = maximizing ? -Infinity : Infinity;
  let a = alpha;
  let b = beta;

  for (const move of moves) {
    const next = playMove(state, move);
    const score = negamax(next, depth - 1, ply + 1, a, b, ctx);

    if (maximizing) {
      if (score > best) best = score;
      if (best > a) a = best;
    } else {
      if (score < best) best = score;
      if (best < b) b = best;
    }

    if (b <= a) break;
    if (ctx.aborted) break;
  }

  return best;
};

export interface SearchResult {
  readonly move: Move | null;
  readonly score: number;
  readonly depth: number;
  readonly nodes: number;
}

/**
 * Cherche le meilleur coup pour le joueur au trait.
 *
 * L'approfondissement itératif garantit qu'un coup jouable est toujours
 * disponible, même si le budget de temps expire au milieu d'une itération : on
 * conserve alors le résultat de la dernière profondeur complètement explorée.
 */
export const findBestMove = (
  state: GameState,
  difficulty: Difficulty = 'medium',
  random: () => number = Math.random,
): SearchResult => {
  const profile = DIFFICULTY_PROFILES[difficulty];
  const moves = orderMoves(legalMoves(state));

  if (moves.length === 0) {
    return { move: null, score: 0, depth: 0, nodes: 0 };
  }
  if (moves.length === 1) {
    return { move: moves[0], score: 0, depth: 0, nodes: 0 };
  }

  if (profile.blunderRate > 0 && random() < profile.blunderRate) {
    return {
      move: moves[Math.floor(random() * moves.length)],
      score: 0,
      depth: 0,
      nodes: 0,
    };
  }

  const ctx: SearchContext = {
    rootPlayer: state.currentPlayer,
    deadline: Date.now() + profile.timeBudgetMs,
    nodes: 0,
    aborted: false,
  };

  let best: Move = moves[0];
  let bestScore = -Infinity;
  let reachedDepth = 0;

  for (let depth = 1; depth <= profile.depth; depth++) {
    let iterationBest: Move | null = null;
    let iterationScore = -Infinity;
    let alpha = -Infinity;

    for (const move of moves) {
      const next = playMove(state, move);
      const score = negamax(next, depth - 1, 1, alpha, Infinity, ctx);

      if (ctx.aborted) break;
      if (score > iterationScore) {
        iterationScore = score;
        iterationBest = move;
      }
      if (score > alpha) alpha = score;
    }

    // Une itération interrompue est incomplète : on garde la précédente.
    if (ctx.aborted) break;
    if (iterationBest) {
      best = iterationBest;
      bestScore = iterationScore;
      reachedDepth = depth;
    }
  }

  return { move: best, score: bestScore, depth: reachedDepth, nodes: ctx.nodes };
};

/**
 * Délai d'attente avant que l'adversaire ne joue, en millisecondes.
 * Un délai fixe sonne mécanique ; on le fait varier, et on laisse l'IA
 * « hésiter » plus longtemps quand la position offre beaucoup d'options.
 */
export const thinkingDelay = (
  state: GameState,
  random: () => number = Math.random,
): number => {
  const options = legalMoves(state).length;
  const base = 380 + Math.min(options, 12) * 45;
  return Math.round(base + random() * 260);
};

/** Indice pour le joueur humain : le coup que l'IA jouerait à sa place. */
export const suggestMove = (state: GameState): Move | null =>
  findBestMove(state, 'hard').move;

export const materialBalance = (board: Board, player: Player): number =>
  countPieces(board, player) - countPieces(board, opponentOf(player));
