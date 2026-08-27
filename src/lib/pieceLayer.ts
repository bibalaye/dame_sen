/**
 * Suivi d'identité des pièces entre deux positions.
 *
 * Le plateau du moteur ne décrit que le contenu des cases : à chaque coup,
 * React démonterait la pièce de la case de départ et en monterait une autre à
 * l'arrivée — d'où l'impression de téléportation. En donnant à chaque pièce un
 * identifiant stable, on peut au contraire la déplacer, et donc l'animer.
 *
 * La pièce prise ne disparaît pas non plus d'un coup : elle est conservée avec
 * l'indicateur `exiting` le temps de son animation de sortie.
 */

import { BOARD_SIZE, type Board, type Move, type Player } from './engine.ts';

export interface PieceView {
  readonly id: number;
  readonly player: Player;
  readonly isKing: boolean;
  readonly row: number;
  readonly col: number;
  /** La pièce vient d'être prise : elle s'envole puis sera retirée. */
  readonly exiting: boolean;
  /** La pièce vient d'être promue : déclenche le halo de promotion. */
  readonly promoting: boolean;
}

export interface Reconciliation {
  readonly pieces: readonly PieceView[];
  readonly nextId: number;
}

const key = (row: number, col: number) => `${row},${col}`;

/** Première construction : chaque pièce du plateau reçoit un identifiant. */
export const initialPieces = (board: Board, startId = 1): Reconciliation => {
  const pieces: PieceView[] = [];
  let nextId = startId;

  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const piece = board[row][col];
      if (!piece) continue;
      pieces.push({
        id: nextId++,
        player: piece.player,
        isKing: piece.isKing,
        row,
        col,
        exiting: false,
        promoting: false,
      });
    }
  }

  return { pieces, nextId };
};

/**
 * Reporte les identifiants de la position précédente sur la nouvelle.
 *
 * `lastMove` indique quelle pièce a bougé : son identifiant suit la case de
 * départ vers la case d'arrivée. Les pièces présentes avant et absentes après
 * sont sorties du plateau — elles restent dans la liste, marquées `exiting`,
 * pour que le composant puisse les animer avant de les retirer.
 */
export const reconcilePieces = (
  previous: readonly PieceView[],
  board: Board,
  lastMove: Move | null,
  nextId: number,
): Reconciliation => {
  const byPosition = new Map<string, PieceView>();
  for (const piece of previous) {
    // Les pièces déjà en sortie ne participent pas à l'appariement.
    if (!piece.exiting) byPosition.set(key(piece.row, piece.col), piece);
  }

  const pieces: PieceView[] = [];
  const matched = new Set<number>();
  let id = nextId;

  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const piece = board[row][col];
      if (!piece) continue;

      const cameFrom =
        lastMove && lastMove.toRow === row && lastMove.toCol === col
          ? byPosition.get(key(lastMove.fromRow, lastMove.fromCol))
          : byPosition.get(key(row, col));

      const previousPiece =
        cameFrom && cameFrom.player === piece.player ? cameFrom : undefined;

      if (previousPiece) matched.add(previousPiece.id);

      pieces.push({
        id: previousPiece?.id ?? id++,
        player: piece.player,
        isKing: piece.isKing,
        row,
        col,
        exiting: false,
        promoting: previousPiece ? !previousPiece.isKing && piece.isKing : false,
      });
    }
  }

  // Ce qui était sur le plateau et n'y est plus a été pris.
  for (const piece of previous) {
    if (piece.exiting || matched.has(piece.id)) continue;
    pieces.push({ ...piece, exiting: true, promoting: false });
  }

  return { pieces, nextId: id };
};

/** Retire les pièces dont l'animation de sortie est terminée. */
export const dropExiting = (pieces: readonly PieceView[]): PieceView[] =>
  pieces.filter((piece) => !piece.exiting);
