/**
 * Moteur du morpion à trois pions.
 *
 * Le morpion à pose s'épuise vite : la grille se remplit, et une partie sur
 * deux se fige en nul sans que personne ait rien décidé. Cette version en
 * ajoute une seconde : chaque joueur ne dispose que de trois pions, et une fois
 * les six posés, on ne s'arrête pas — on les déplace.
 *
 *  - Phase de pose : chacun place ses trois pions. Trois alignés, c'est gagné.
 *  - Phase de déplacement : à son tour, on déplace l'un de ses pions vers
 *    n'importe quelle case libre. Le pion n'est pas tenu de rester dans son
 *    voisinage : il va où il veut, ce qui laisse toute liberté pour construire
 *    l'alignement. Un joueur a donc toujours neuf coups à sa disposition.
 *  - La partie est nulle si la même position revient trois fois, ou après
 *    cinquante déplacements sans alignement.
 *
 * Comme le moteur des dames, ce module est pur : aucune mutation, aucun effet
 * de bord, tout est testable hors de l'interface.
 */

export type Mark = 'X' | 'O';
export type Cell = Mark | null;

/** Grille à plat : indices 0 à 8, de haut en bas et de gauche à droite. */
export type Grid = readonly Cell[];

export type Line = readonly [number, number, number];

export const PIECES_PER_PLAYER = 3;

/** Déplacements sans alignement au bout desquels la partie est nulle. */
export const NO_WIN_LIMIT = 50;

/** Répétitions d'une même position qui rendent la partie nulle. */
export const REPETITION_LIMIT = 3;

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

export type Phase = 'placement' | 'movement';

/**
 * Les deux façons de jouer.
 *
 * `classic` : les huit alignements comptent en permanence.
 *
 * `moving-heart` : une case porte le « cœur ». Les alignements qui la
 * traversent ne comptent pas, et le cœur change de case toutes les trois tours.
 * Le centre n'est spécial que parce qu'il porte quatre alignements contre trois
 * pour un coin et deux pour un bord : déplacer cet avantage empêche toute
 * position d'équilibre durable, et c'est ce qui fait tomber les nulles.
 */
export type MorpionVariant = 'classic' | 'moving-heart';

/** Le cœur passe par le centre puis fait le tour des coins. */
export const HEART_PATH: readonly number[] = [4, 0, 2, 8, 6];

/** Demi-coups entre deux déplacements du cœur : trois tours complets. */
export const HEART_PERIOD = 6;

export type MorpionMove =
  | { readonly type: 'place'; readonly to: number }
  | { readonly type: 'move'; readonly from: number; readonly to: number };

export type MorpionStatus =
  | { readonly kind: 'playing' }
  | { readonly kind: 'win'; readonly winner: Mark; readonly line: Line }
  | {
      readonly kind: 'draw';
      readonly reason: 'repetition' | 'no-progress';
    };

export interface MorpionState {
  readonly grid: Grid;
  readonly current: Mark;
  readonly phase: Phase;
  readonly variant: MorpionVariant;
  /** Case portant le cœur, ou `null` en variante classique. */
  readonly heart: number | null;
  /** Demi-coups restants avant que le cœur ne change de case. */
  readonly movesUntilShift: number;
  /** Pions déjà posés par chaque camp. */
  readonly placed: Readonly<Record<Mark, number>>;
  readonly status: MorpionStatus;
  readonly lastMove: MorpionMove | null;
  /** Déplacements enchaînés sans alignement. */
  readonly idleMoves: number;
  readonly positionCounts: Readonly<Record<string, number>>;
}

export const other = (mark: Mark): Mark => (mark === 'X' ? 'O' : 'X');

const EMPTY_GRID: Grid = Array<Cell>(9).fill(null);

export const serializeGrid = (grid: Grid): string =>
  grid.map((cell) => cell ?? '.').join('');

const positionKey = (
  grid: Grid,
  current: Mark,
  heart: number | null = null,
): string => `${serializeGrid(grid)}:${current}:${heart ?? '-'}`;

export const createMorpion = (
  first: Mark = 'X',
  variant: MorpionVariant = 'classic',
): MorpionState => ({
  grid: EMPTY_GRID,
  current: first,
  phase: 'placement',
  variant,
  heart: variant === 'moving-heart' ? HEART_PATH[0] : null,
  movesUntilShift: HEART_PERIOD,
  placed: { X: 0, O: 0 },
  status: { kind: 'playing' },
  lastMove: null,
  idleMoves: 0,
  positionCounts: {},
});

/**
 * Les alignements qui comptent. Le cœur neutralise ceux qui le traversent :
 * posé au centre il en désactive quatre, sur un coin trois.
 */
export const activeLines = (heart: number | null): readonly Line[] =>
  heart === null ? LINES : LINES.filter((line) => !line.includes(heart));

/** La ligne gagnante d'une grille, s'il y en a une. */
export const findWinningLine = (
  grid: Grid,
  heart: number | null = null,
): { mark: Mark; line: Line } | null => {
  for (const line of activeLines(heart)) {
    const [a, b, c] = line;
    const mark = grid[a];
    if (mark && mark === grid[b] && mark === grid[c]) return { mark, line };
  }
  return null;
};

/** Tous les coups légaux du joueur au trait, dans la phase où il se trouve. */
export const availableMoves = (state: MorpionState): MorpionMove[] => {
  if (state.status.kind !== 'playing') return [];

  const moves: MorpionMove[] = [];

  if (state.phase === 'placement') {
    for (let i = 0; i < 9; i++) {
      if (!state.grid[i]) moves.push({ type: 'place', to: i });
    }
    return moves;
  }

  // Déplacement libre : n'importe quel pion à soi vers n'importe quelle case
  // vide. Avec trois pions et trois cases libres, il y a toujours neuf coups.
  for (let from = 0; from < 9; from++) {
    if (state.grid[from] !== state.current) continue;
    for (let to = 0; to < 9; to++) {
      if (!state.grid[to]) moves.push({ type: 'move', from, to });
    }
  }
  return moves;
};

export const sameMove = (a: MorpionMove, b: MorpionMove): boolean =>
  a.type === b.type &&
  a.to === b.to &&
  (a.type === 'place' || b.type === 'place' || a.from === b.from);

/**
 * Joue un coup. Un coup illégal — case occupée, pion adverse, case non voisine,
 * partie finie — renvoie l'état inchangé.
 */
export const playMorpion = (
  state: MorpionState,
  move: MorpionMove,
): MorpionState => {
  if (state.status.kind !== 'playing') return state;
  if (!availableMoves(state).some((candidate) => sameMove(candidate, move))) {
    return state;
  }

  const grid = state.grid.slice();
  if (move.type === 'place') {
    grid[move.to] = state.current;
  } else {
    grid[move.from] = null;
    grid[move.to] = state.current;
  }

  const placed =
    move.type === 'place'
      ? { ...state.placed, [state.current]: state.placed[state.current] + 1 }
      : state.placed;

  const won = findWinningLine(grid, state.heart);
  if (won) {
    return {
      ...state,
      grid,
      placed,
      current: other(state.current),
      // La phase suit la pose : elle sert encore à l'affichage du résultat.
      phase: placed.X + placed.O >= PIECES_PER_PLAYER * 2 ? 'movement' : 'placement',
      status: { kind: 'win', winner: won.mark, line: won.line },
      lastMove: move,
      idleMoves: state.idleMoves,
      positionCounts: state.positionCounts,
    };
  }

  const next = other(state.current);
  const phase: Phase =
    placed.X + placed.O >= PIECES_PER_PLAYER * 2 ? 'movement' : 'placement';

  // La pose fait avancer la partie ; seuls les déplacements comptent comme
  // du surplace.
  const idleMoves = move.type === 'place' ? 0 : state.idleMoves + 1;

  // Le cœur ne bouge que pendant la phase de déplacement : le faire glisser
  // pendant la pose rendrait la position illisible avant même de jouer.
  // Le compteur suit les déplacements, pas les poses : le coup qui fait entrer
  // en phase 2 est encore une pose et ne doit rien décompter.
  const shifting = state.variant === 'moving-heart' && move.type === 'move';
  const countdown = shifting ? state.movesUntilShift - 1 : state.movesUntilShift;
  const shifts = shifting && countdown <= 0;

  const heart = shifts
    ? HEART_PATH[(HEART_PATH.indexOf(state.heart ?? HEART_PATH[0]) + 1) % HEART_PATH.length]
    : state.heart;

  // La position inclut le cœur : la même grille sous deux cœurs différents
  // n'offre pas les mêmes alignements, ce n'est donc pas une répétition.
  const key = positionKey(grid, next, heart);
  const positionCounts =
    phase === 'movement'
      ? { ...state.positionCounts, [key]: (state.positionCounts[key] ?? 0) + 1 }
      : state.positionCounts;

  const draft: MorpionState = {
    grid,
    current: next,
    phase,
    variant: state.variant,
    heart,
    movesUntilShift: shifts ? HEART_PERIOD : countdown,
    placed,
    status: { kind: 'playing' },
    lastMove: move,
    idleMoves,
    positionCounts,
  };

  // Le cœur venant de bouger peut libérer un alignement déjà formé.
  if (shifts) {
    const revealed = findWinningLine(grid, heart);
    if (revealed) {
      return {
        ...draft,
        status: { kind: 'win', winner: revealed.mark, line: revealed.line },
      };
    }
  }

  if ((positionCounts[key] ?? 0) >= REPETITION_LIMIT) {
    return { ...draft, status: { kind: 'draw', reason: 'repetition' } };
  }
  if (idleMoves >= NO_WIN_LIMIT) {
    return { ...draft, status: { kind: 'draw', reason: 'no-progress' } };
  }
  return draft;
};

// --- Adversaire -------------------------------------------------------------

export type MorpionDifficulty = 'easy' | 'medium' | 'hard';

export interface MorpionOpponent {
  readonly id: MorpionDifficulty;
  readonly name: string;
  readonly tagline: string;
}

export const MORPION_OPPONENTS: readonly MorpionOpponent[] = [
  { id: 'easy', name: 'Le petit', tagline: 'Attaque sans regarder derrière' },
  { id: 'medium', name: 'La cousine', tagline: 'Attaque et défend à parts égales' },
  { id: 'hard', name: 'Le vieux', tagline: 'Ne se laisse pas aligner' },
];

/**
 * Profondeur de recherche de chaque niveau, en demi-coups.
 *
 * Le déplacement libre porte le nombre de coups à neuf par tour, contre quatre
 * environ avec un déplacement de proche en proche : l'arbre grossit d'autant, et
 * la profondeur doit rester mesurée pour que l'adversaire réponde vite.
 */
const DEPTHS: Readonly<Record<MorpionDifficulty, number>> = {
  easy: 2,
  medium: 4,
  hard: 6,
};

/** Part de coups joués au hasard, ce qui rend les niveaux faibles battables. */
const BLUNDER: Readonly<Record<MorpionDifficulty, number>> = {
  easy: 0.35,
  medium: 0.1,
  hard: 0,
};

const WIN_SCORE = 1000;

/**
 * Note une position. Le matériel étant fixe, seule compte la menace : les
 * lignes où l'on a deux pions sans opposition, et le centre, qui touche toutes
 * les cases et vaut donc une mobilité supérieure.
 *
 * `attackBias` décide du tempérament : au-dessus de 1, l'adversaire pense
 * surtout à ses propres alignements et laisse passer ceux d'en face. C'est ce
 * qui distingue le petit de la cousine, plutôt qu'une recherche bridée.
 */
const evaluate = (state: MorpionState, me: Mark, attackBias: number): number => {
  const enemy = other(me);
  let score = 0;

  for (const [a, b, c] of activeLines(state.heart)) {
    const cells = [state.grid[a], state.grid[b], state.grid[c]];
    const mine = cells.filter((cell) => cell === me).length;
    const theirs = cells.filter((cell) => cell === enemy).length;

    if (mine === 2 && theirs === 0) score += 10 * attackBias;
    if (theirs === 2 && mine === 0) score -= 12;
    if (mine === 1 && theirs === 0) score += 1;
  }

  // Occuper une case chargée d'alignements vaut mieux qu'une case morte.
  for (const cell of [0, 2, 4, 6, 8]) {
    const weight = activeLines(state.heart).filter((line) => line.includes(cell)).length;
    if (state.grid[cell] === me) score += weight;
    if (state.grid[cell] === enemy) score -= weight;
  }

  return score;
};

/**
 * Les coups qui alignent d'abord : explorés en tête, ils font tomber le reste
 * de la branche par élagage et divisent le temps de recherche.
 */
const orderMoves = (state: MorpionState): MorpionMove[] => {
  const winning: MorpionMove[] = [];
  const rest: MorpionMove[] = [];

  for (const move of availableMoves(state)) {
    if (playMorpion(state, move).status.kind === 'win') winning.push(move);
    else rest.push(move);
  }

  return winning.length > 0 ? [...winning, ...rest] : rest;
};

interface SearchContext {
  readonly me: Mark;
  readonly attackBias: number;
  /** Positions du chemin courant : y revenir est une répétition, donc un nul. */
  readonly path: Set<string>;
}

const search = (
  state: MorpionState,
  depth: number,
  ply: number,
  alpha: number,
  beta: number,
  ctx: SearchContext,
): number => {
  if (state.status.kind === 'win') {
    return state.status.winner === ctx.me ? WIN_SCORE - ply : ply - WIN_SCORE;
  }
  if (state.status.kind === 'draw') return 0;
  if (depth <= 0) return evaluate(state, ctx.me, ctx.attackBias);

  const key = positionKey(state.grid, state.current, state.heart);
  // Boucler ramène au même point : on traite le cycle comme une nulle plutôt
  // que de l'explorer indéfiniment.
  if (state.phase === 'movement' && ctx.path.has(key)) return 0;
  ctx.path.add(key);

  const maximizing = state.current === ctx.me;
  let best = maximizing ? -Infinity : Infinity;
  let a = alpha;
  let b = beta;

  for (const move of orderMoves(state)) {
    const value = search(playMorpion(state, move), depth - 1, ply + 1, a, b, ctx);

    if (maximizing) {
      if (value > best) best = value;
      if (best > a) a = best;
    } else {
      if (value < best) best = value;
      if (best < b) b = best;
    }
    if (b <= a) break;
  }

  ctx.path.delete(key);
  return Number.isFinite(best) ? best : evaluate(state, ctx.me, ctx.attackBias);
};

/** Le meilleur coup trouvé, à la profondeur et au tempérament demandés. */
export const bestMove = (
  state: MorpionState,
  depth: number = DEPTHS.hard,
  attackBias = 1,
): MorpionMove | null => {
  const moves = availableMoves(state);
  if (moves.length === 0) return null;

  const ctx: SearchContext = { me: state.current, attackBias, path: new Set() };
  let best = moves[0];
  let bestScore = -Infinity;

  for (const move of orderMoves(state)) {
    const value = search(playMorpion(state, move), depth - 1, 1, -Infinity, Infinity, ctx);
    if (value > bestScore) {
      bestScore = value;
      best = move;
    }
  }

  return best;
};

/** Un coup qui aligne immédiatement, s'il en existe un. */
const winningMove = (state: MorpionState): MorpionMove | null =>
  availableMoves(state).find(
    (move) => playMorpion(state, move).status.kind === 'win',
  ) ?? null;

export const findBestMorpionMove = (
  state: MorpionState,
  difficulty: MorpionDifficulty,
  random: () => number = Math.random,
): MorpionMove | null => {
  const moves = availableMoves(state);
  if (moves.length === 0) return null;

  // Tous les niveaux saisissent un alignement offert : en laisser passer un ne
  // serait pas « faible », ce serait cassé.
  const win = winningMove(state);
  if (win) return win;

  if (random() < BLUNDER[difficulty]) {
    return moves[Math.floor(random() * moves.length)];
  }

  // Le petit fonce tête baissée, la cousine pèse le pour et le contre.
  const attackBias = difficulty === 'easy' ? 2.2 : 1;
  return bestMove(state, DEPTHS[difficulty], attackBias);
};

/** Délai de réflexion, pour que l'adversaire ne réponde pas instantanément. */
export const morpionThinkingDelay = (random: () => number = Math.random): number =>
  Math.round(320 + random() * 420);
