/**
 * Moteur de règles des dames sénégalaises (plateau 5x5).
 *
 * Ce module est volontairement pur : aucune dépendance à React, aucun effet de
 * bord, aucune mutation des valeurs reçues. Toute fonction qui « modifie » le
 * jeu renvoie un nouvel état. C'est ce qui rend la recherche de l'IA possible
 * (elle explore des milliers de positions par coup) et les règles testables.
 *
 * Règles implémentées, telles que jouées dans cette variante :
 *  - Plateau 5x5, déplacements orthogonaux uniquement (jamais en diagonale).
 *  - Un pion avance d'une case vers le camp adverse, ou se décale d'une case à
 *    gauche ou à droite. Il ne recule jamais.
 *  - Un pion capture par-dessus une pièce adverse adjacente, en atterrissant
 *    sur la case immédiatement derrière — devant lui ou sur les côtés, jamais
 *    vers l'arrière : il ne prend que là où il peut se déplacer.
 *  - Une dame se déplace de plusieurs cases dans les quatre directions et
 *    capture la première pièce adverse rencontrée sur sa ligne. Elle vole :
 *    elle choisit librement sa case d'arrivée parmi les cases libres situées
 *    au-delà de la pièce prise.
 *  - La capture est obligatoire : s'il existe au moins une prise, seules les
 *    prises sont légales.
 *  - Les prises s'enchaînent : tant que la pièce qui vient de prendre peut
 *    reprendre, le trait reste au même joueur avec cette pièce.
 *  - Un pion qui atteint la dernière rangée adverse devient dame. S'il était en
 *    pleine rafle, il la poursuit avec sa nouvelle portée.
 *  - Réduit à une seule pièce, un camp la reçoit en dame d'office.
 */

export const BOARD_SIZE = 5;

export type Player = 'white' | 'black';

export interface Piece {
  readonly player: Player;
  readonly isKing: boolean;
}

/** Une case : une pièce, ou rien. */
export type Square = Piece | null;

/** Le plateau, indexé [rangée][colonne]. La rangée 0 est le camp des blancs. */
export type Board = readonly (readonly Square[])[];

export interface Position {
  readonly row: number;
  readonly col: number;
}

export interface Move {
  readonly fromRow: number;
  readonly fromCol: number;
  readonly toRow: number;
  readonly toCol: number;
  /** Position de la pièce capturée, absente si le coup est un simple déplacement. */
  readonly captureRow?: number;
  readonly captureCol?: number;
}

export type Status =
  | { readonly kind: 'playing' }
  | { readonly kind: 'win'; readonly winner: Player; readonly reason: 'capture' | 'block' }
  | { readonly kind: 'draw'; readonly reason: 'no-progress' | 'repetition' };

/** Les trois dispositions de départ étudiées. */
export type Variant = 'classic' | 'open-center' | 'free-drop';

export interface GameState {
  readonly board: Board;
  readonly currentPlayer: Player;
  /**
   * Quand une rafle est en cours, la case de la pièce qui doit continuer à
   * prendre. Le joueur ne peut alors jouer que cette pièce.
   */
  readonly chainFrom: Position | null;
  /** Demi-coups joués sans prise ni promotion, pour la nulle d'inaction. */
  readonly halfmoveClock: number;
  /** Nombre d'occurrences de chaque position, pour la nulle par répétition. */
  readonly positionCounts: Readonly<Record<string, number>>;
  readonly status: Status;
  readonly lastMove: Move | null;
  /** Case de la pièce prise au dernier coup, pour l'animation de sortie. */
  readonly lastCapture: Position | null;
  /** Vrai si le dernier coup a transformé un pion en dame. */
  readonly lastPromotion: boolean;
  /** Prises enchaînées par le tour en cours : 3 pour une rafle triple. */
  readonly chainLength: number;
}

/** Coups complets sans prise ni promotion au bout desquels la partie est nulle. */
export const NO_PROGRESS_LIMIT = 25;

/** Nombre de répétitions d'une même position qui rend la partie nulle. */
export const REPETITION_LIMIT = 3;

export const opponentOf = (player: Player): Player =>
  player === 'white' ? 'black' : 'white';

export const isInside = (row: number, col: number): boolean =>
  row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;

export const pieceAt = (board: Board, row: number, col: number): Square =>
  isInside(row, col) ? board[row][col] : null;

/** Rangée sur laquelle un pion du joueur est promu. */
const promotionRow = (player: Player): number =>
  player === 'white' ? BOARD_SIZE - 1 : 0;

/** Sens d'avancée d'un pion : les blancs montent en rangée, les noirs descendent. */
const forwardOf = (player: Player): number => (player === 'white' ? 1 : -1);

const ALL_DIRECTIONS: readonly Position[] = [
  { row: 1, col: 0 },
  { row: -1, col: 0 },
  { row: 0, col: 1 },
  { row: 0, col: -1 },
];

const emptyBoard = (): Square[][] =>
  Array.from({ length: BOARD_SIZE }, () => Array<Square>(BOARD_SIZE).fill(null));

const pawn = (player: Player): Piece => ({ player, isKing: false });

/**
 * Construit la position de départ.
 *
 * `classic` reproduit la disposition historique du projet : 12 pièces par camp
 * et une seule case libre, ce qui ne laisse que deux coups au premier joueur.
 * `open-center` vide la rangée médiane (10 pièces par camp) et fait passer
 * l'ouverture à cinq coups. `free-drop` sert de base à la variante où chacun
 * pose librement ses deux dernières pièces.
 */
export const createBoard = (variant: Variant = 'classic'): Board => {
  const board = emptyBoard();

  for (let col = 0; col < BOARD_SIZE; col++) {
    board[0][col] = pawn('white');
    board[1][col] = pawn('white');
    board[BOARD_SIZE - 2][col] = pawn('black');
    board[BOARD_SIZE - 1][col] = pawn('black');
  }

  if (variant === 'classic') {
    board[2][0] = pawn('white');
    board[2][1] = pawn('white');
    board[2][BOARD_SIZE - 2] = pawn('black');
    board[2][BOARD_SIZE - 1] = pawn('black');
  }

  if (variant === 'free-drop') {
    // Huit pièces posées d'office, deux à placer librement par chaque joueur
    // avant le premier coup : le camp compte dix pièces une fois la pose finie.
    board[0][2] = null;
    board[1][2] = null;
    board[BOARD_SIZE - 1][2] = null;
    board[BOARD_SIZE - 2][2] = null;
  }

  return board;
};

/** Clone superficiel : les pièces sont immuables, seules les lignes sont copiées. */
const cloneBoard = (board: Board): Square[][] => board.map((row) => row.slice());

/** Signature textuelle d'une position, pour détecter les répétitions. */
export const serializeBoard = (board: Board): string => {
  let out = '';
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const piece = board[row][col];
      if (!piece) {
        out += '.';
      } else if (piece.player === 'white') {
        out += piece.isKing ? 'W' : 'w';
      } else {
        out += piece.isKing ? 'B' : 'b';
      }
    }
  }
  return out;
};

const positionKey = (board: Board, player: Player): string =>
  `${serializeBoard(board)}:${player}`;

/** Les prises possibles pour la pièce posée sur cette case. */
export const generateCapturesForPiece = (
  board: Board,
  row: number,
  col: number,
): Move[] => {
  const piece = pieceAt(board, row, col);
  if (!piece) return [];

  const captures: Move[] = [];
  const enemy = opponentOf(piece.player);

  if (piece.isKing) {
    for (const dir of ALL_DIRECTIONS) {
      // La dame balaie sa ligne jusqu'à la première pièce rencontrée.
      let r = row + dir.row;
      let c = col + dir.col;
      while (isInside(r, c) && !board[r][c]) {
        r += dir.row;
        c += dir.col;
      }
      if (!isInside(r, c)) continue;
      if (board[r][c]!.player !== enemy) continue;

      // La dame vole : elle peut s'arrêter sur n'importe quelle case libre
      // au-delà de la pièce prise, pas seulement sur la première.
      let landRow = r + dir.row;
      let landCol = c + dir.col;
      while (isInside(landRow, landCol) && !board[landRow][landCol]) {
        captures.push({
          fromRow: row,
          fromCol: col,
          toRow: landRow,
          toCol: landCol,
          captureRow: r,
          captureCol: c,
        });
        landRow += dir.row;
        landCol += dir.col;
      }
    }

    return captures;
  }

  // Un pion prend là où il peut aller : devant lui et sur les côtés, jamais
  // derrière. Une pièce dépassée est hors de danger.
  const forward = forwardOf(piece.player);
  const pawnDirections: readonly Position[] = [
    { row: forward, col: 0 },
    { row: 0, col: -1 },
    { row: 0, col: 1 },
  ];

  for (const dir of pawnDirections) {
    const overRow = row + dir.row;
    const overCol = col + dir.col;
    const target = pieceAt(board, overRow, overCol);
    if (!target || target.player !== enemy) continue;

    const landRow = overRow + dir.row;
    const landCol = overCol + dir.col;
    if (isInside(landRow, landCol) && !board[landRow][landCol]) {
      captures.push({
        fromRow: row,
        fromCol: col,
        toRow: landRow,
        toCol: landCol,
        captureRow: overRow,
        captureCol: overCol,
      });
    }
  }

  return captures;
};

/** Les déplacements simples (sans prise) possibles pour cette pièce. */
export const generateQuietMovesForPiece = (
  board: Board,
  row: number,
  col: number,
): Move[] => {
  const piece = pieceAt(board, row, col);
  if (!piece) return [];

  const moves: Move[] = [];

  if (piece.isKing) {
    for (const dir of ALL_DIRECTIONS) {
      let r = row + dir.row;
      let c = col + dir.col;
      while (isInside(r, c) && !board[r][c]) {
        moves.push({ fromRow: row, fromCol: col, toRow: r, toCol: c });
        r += dir.row;
        c += dir.col;
      }
    }
    return moves;
  }

  const forward = forwardOf(piece.player);
  const steps: readonly Position[] = [
    { row: forward, col: 0 },
    { row: 0, col: -1 },
    { row: 0, col: 1 },
  ];

  for (const step of steps) {
    const r = row + step.row;
    const c = col + step.col;
    if (isInside(r, c) && !board[r][c]) {
      moves.push({ fromRow: row, fromCol: col, toRow: r, toCol: c });
    }
  }

  return moves;
};

/**
 * Tous les coups légaux d'un joueur, capture obligatoire appliquée : dès qu'une
 * prise existe quelque part, elle est la seule option.
 */
export const generateMoves = (board: Board, player: Player): Move[] => {
  const captures: Move[] = [];
  const quiet: Move[] = [];

  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const piece = board[row][col];
      if (!piece || piece.player !== player) continue;

      captures.push(...generateCapturesForPiece(board, row, col));
      if (captures.length === 0) {
        quiet.push(...generateQuietMovesForPiece(board, row, col));
      }
    }
  }

  return captures.length > 0 ? captures : quiet;
};

/** Les coups légaux dans l'état courant, rafle en cours comprise. */
export const legalMoves = (state: GameState): Move[] => {
  if (state.status.kind !== 'playing') return [];
  if (state.chainFrom) {
    return generateCapturesForPiece(
      state.board,
      state.chainFrom.row,
      state.chainFrom.col,
    );
  }
  return generateMoves(state.board, state.currentPlayer);
};

/** Les coups légaux partant d'une case donnée. */
export const legalMovesFrom = (
  state: GameState,
  row: number,
  col: number,
): Move[] =>
  legalMoves(state).filter((move) => move.fromRow === row && move.fromCol === col);

export const countPieces = (board: Board, player: Player): number => {
  let total = 0;
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      if (board[row][col]?.player === player) total++;
    }
  }
  return total;
};

/**
 * Promeut d'office la dernière pièce d'un camp.
 *
 * Réduit à une seule pièce, un joueur la reçoit en dame : sans cela, un pion
 * isolé ne peut ni reculer ni couvrir ses arrières, et la fin de partie n'est
 * plus qu'une poursuite jouée d'avance. La règle vaut pour les deux camps.
 *
 * Renvoie le plateau reçu tel quel quand rien ne change.
 */
export const promoteLoneSurvivor = (board: Board): Board => {
  let promoted: Square[][] | null = null;

  for (const player of ['white', 'black'] as const) {
    let found: Position | null = null;
    let count = 0;

    for (let row = 0; row < BOARD_SIZE && count < 2; row++) {
      for (let col = 0; col < BOARD_SIZE && count < 2; col++) {
        if (board[row][col]?.player !== player) continue;
        count++;
        found = { row, col };
      }
    }

    if (count !== 1 || !found) continue;

    const piece = board[found.row][found.col]!;
    if (piece.isKing) continue;

    promoted = promoted ?? cloneBoard(board);
    promoted[found.row][found.col] = { player, isKing: true };
  }

  return promoted ?? board;
};

export interface AppliedMove {
  readonly board: Board;
  readonly captured: Piece | null;
  readonly promoted: boolean;
}

/**
 * Applique un coup au plateau. Ne vérifie pas sa légalité : les appelants
 * passent par `legalMoves`. Le plateau reçu n'est jamais modifié.
 */
export const applyMove = (board: Board, move: Move): AppliedMove => {
  const next = cloneBoard(board);
  const moving = next[move.fromRow][move.fromCol];
  if (!moving) {
    return { board, captured: null, promoted: false };
  }

  next[move.fromRow][move.fromCol] = null;

  let captured: Piece | null = null;
  if (move.captureRow !== undefined && move.captureCol !== undefined) {
    captured = next[move.captureRow][move.captureCol];
    next[move.captureRow][move.captureCol] = null;
  }

  const reachedLastRow = move.toRow === promotionRow(moving.player);
  const promoted = !moving.isKing && reachedLastRow;
  next[move.toRow][move.toCol] = promoted
    ? { player: moving.player, isKing: true }
    : moving;

  return { board: next, captured, promoted };
};

/**
 * Détermine le sort de la partie pour le joueur qui vient de recevoir le trait.
 * Appelée après chaque changement de trait, jamais sur des compteurs mémorisés
 * ailleurs : le plateau est la seule source de vérité.
 */
export const evaluateStatus = (
  board: Board,
  playerToMove: Player,
  halfmoveClock: number,
  positionCounts: Readonly<Record<string, number>>,
): Status => {
  if (countPieces(board, playerToMove) === 0) {
    return { kind: 'win', winner: opponentOf(playerToMove), reason: 'capture' };
  }
  if (generateMoves(board, playerToMove).length === 0) {
    return { kind: 'win', winner: opponentOf(playerToMove), reason: 'block' };
  }
  if (halfmoveClock >= NO_PROGRESS_LIMIT * 2) {
    return { kind: 'draw', reason: 'no-progress' };
  }
  if ((positionCounts[positionKey(board, playerToMove)] ?? 0) >= REPETITION_LIMIT) {
    return { kind: 'draw', reason: 'repetition' };
  }
  return { kind: 'playing' };
};

export const createGame = (
  variant: Variant = 'classic',
  firstPlayer: Player = 'white',
): GameState => {
  const board = createBoard(variant);
  return {
    board,
    currentPlayer: firstPlayer,
    chainFrom: null,
    halfmoveClock: 0,
    positionCounts: { [positionKey(board, firstPlayer)]: 1 },
    status: { kind: 'playing' },
    lastMove: null,
    lastCapture: null,
    lastPromotion: false,
    chainLength: 0,
  };
};

export const isSameMove = (a: Move, b: Move): boolean =>
  a.fromRow === b.fromRow &&
  a.fromCol === b.fromCol &&
  a.toRow === b.toRow &&
  a.toCol === b.toCol;

/**
 * Joue un coup et renvoie le nouvel état complet : plateau, trait, rafle en
 * cours, compteurs de nulle et sort de la partie. Un coup illégal est ignoré et
 * l'état est renvoyé tel quel.
 */
export const playMove = (state: GameState, move: Move): GameState => {
  if (state.status.kind !== 'playing') return state;

  const legal = legalMoves(state).find((candidate) => isSameMove(candidate, move));
  if (!legal) return state;

  const applied = applyMove(state.board, legal);
  const { captured, promoted } = applied;
  const board = promoteLoneSurvivor(applied.board);

  // Une prise appelle la suivante. Devenir dame en cours de rafle n'y met pas
  // fin : la pièce poursuit l'enchaînement, désormais avec la portée d'une dame.
  const canChain =
    captured !== null &&
    generateCapturesForPiece(board, legal.toRow, legal.toCol).length > 0;

  const capturedAt =
    captured && legal.captureRow !== undefined && legal.captureCol !== undefined
      ? { row: legal.captureRow, col: legal.captureCol }
      : null;

  // Une prise pendant une rafle allonge le compte ; sinon on repart de zéro.
  const chainLength = captured ? (state.chainFrom ? state.chainLength : 0) + 1 : 0;

  if (canChain) {
    return {
      ...state,
      board,
      chainFrom: { row: legal.toRow, col: legal.toCol },
      halfmoveClock: 0,
      status: { kind: 'playing' },
      lastMove: legal,
      lastCapture: capturedAt,
      lastPromotion: promoted,
      chainLength,
    };
  }

  const nextPlayer = opponentOf(state.currentPlayer);
  const madeProgress = captured !== null || promoted;
  const halfmoveClock = madeProgress ? 0 : state.halfmoveClock + 1;

  // Une prise rend toute position antérieure irrémédiablement inatteignable :
  // le compteur de répétitions repart de zéro.
  const key = positionKey(board, nextPlayer);
  const positionCounts = madeProgress
    ? { [key]: 1 }
    : { ...state.positionCounts, [key]: (state.positionCounts[key] ?? 0) + 1 };

  return {
    board,
    currentPlayer: nextPlayer,
    chainFrom: null,
    halfmoveClock,
    positionCounts,
    status: evaluateStatus(board, nextPlayer, halfmoveClock, positionCounts),
    lastMove: legal,
    lastCapture: capturedAt,
    lastPromotion: promoted,
    chainLength,
  };
};

/** Les cases depuis lesquelles le joueur au trait peut jouer. */
export const movablePositions = (state: GameState): Position[] => {
  const seen = new Set<string>();
  const positions: Position[] = [];
  for (const move of legalMoves(state)) {
    const key = `${move.fromRow},${move.fromCol}`;
    if (seen.has(key)) continue;
    seen.add(key);
    positions.push({ row: move.fromRow, col: move.fromCol });
  }
  return positions;
};

/** Vrai si le joueur au trait est contraint de prendre. */
export const hasMandatoryCapture = (state: GameState): boolean =>
  legalMoves(state).some((move) => move.captureRow !== undefined);
