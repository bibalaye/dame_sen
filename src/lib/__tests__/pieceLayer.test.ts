import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_RULES,
  createGame,
  playMove,
  type Board,
  type GameState,
  type Move,
  type Player,
  type Square,
} from '../engine.ts';
import {
  dropExiting,
  initialPieces,
  reconcilePieces,
  type PieceView,
} from '../pieceLayer.ts';

const findAt = (pieces: readonly PieceView[], row: number, col: number) =>
  pieces.find((piece) => piece.row === row && piece.col === col && !piece.exiting);

const boardFrom = (rows: readonly string[]): Board =>
  rows.map((row) =>
    [...row].map<Square>((char) => {
      switch (char) {
        case 'w':
          return { player: 'white', isKing: false };
        case 'b':
          return { player: 'black', isKing: false };
        default:
          return null;
      }
    }),
  );

const gameFrom = (rows: readonly string[], currentPlayer: Player): GameState => ({
  board: boardFrom(rows),
  currentPlayer,
  chainFrom: null,
  halfmoveClock: 0,
  positionCounts: {},
  status: { kind: 'playing' },
  lastMove: null,
  lastCapture: null,
  lastPromotion: false,
  chainLength: 0,
  lonePlies: 0,
  rules: DEFAULT_RULES,
});

describe('identité des pièces', () => {
  test('chaque pièce du plateau initial reçoit un identifiant unique', () => {
    const { pieces } = initialPieces(createGame('classic').board);
    assert.equal(pieces.length, 24);
    assert.equal(new Set(pieces.map((piece) => piece.id)).size, 24);
  });

  test('une pièce qui se déplace garde son identifiant', () => {
    const game = createGame('open-center');
    const { pieces, nextId } = initialPieces(game.board);
    const before = findAt(pieces, 1, 2);
    assert.ok(before);

    const move: Move = { fromRow: 1, fromCol: 2, toRow: 2, toCol: 2 };
    const next = playMove(game, move);
    const after = reconcilePieces(pieces, next.board, next.lastMove, nextId);

    const moved = findAt(after.pieces, 2, 2);
    assert.ok(moved);
    assert.equal(moved!.id, before!.id, 'la pièce doit être la même, pas une nouvelle');
    assert.equal(findAt(after.pieces, 1, 2), undefined);
  });

  test('aucun identifiant nouveau n’est créé sur un simple déplacement', () => {
    const game = createGame('open-center');
    const { pieces, nextId } = initialPieces(game.board);
    const next = playMove(game, { fromRow: 1, fromCol: 0, toRow: 2, toCol: 0 });
    const after = reconcilePieces(pieces, next.board, next.lastMove, nextId);

    assert.equal(after.nextId, nextId, 'le compteur ne doit pas avancer');
    assert.equal(after.pieces.filter((piece) => !piece.exiting).length, 20);
  });

  test('la pièce prise reste un instant, marquée en sortie', () => {
    const game = gameFrom(
      [
        '.....',
        '.....',
        '.bw..',
        '.....',
        '.....',
      ],
      'white',
    );

    const { pieces, nextId } = initialPieces(game.board);
    const target = findAt(pieces, 2, 1);
    assert.ok(target, 'un pion noir doit se trouver en (2,1)');

    const capture: Move = {
      fromRow: 2,
      fromCol: 2,
      toRow: 2,
      toCol: 0,
      captureRow: 2,
      captureCol: 1,
    };
    const next = playMove(game, capture);
    assert.notEqual(next, game, 'la prise doit être légale');

    const after = reconcilePieces(pieces, next.board, next.lastMove, nextId);
    const exiting = after.pieces.filter((piece) => piece.exiting);

    assert.equal(exiting.length, 1);
    assert.equal(exiting[0].id, target!.id);
    assert.equal(exiting[0].row, 2, 'elle s’envole depuis sa case');
    assert.equal(exiting[0].col, 1);
  });

  test('la promotion est signalée sur la pièce concernée', () => {
    const game = gameFrom(
      [
        '.....',
        '.....',
        '.....',
        '..w..',
        '.....',
      ],
      'white',
    );

    const { pieces, nextId } = initialPieces(game.board);
    const next = playMove(game, { fromRow: 3, fromCol: 2, toRow: 4, toCol: 2 });

    const after = reconcilePieces(pieces, next.board, next.lastMove, nextId);
    const promoted = findAt(after.pieces, 4, 2);

    assert.ok(promoted);
    assert.equal(promoted!.isKing, true);
    assert.equal(promoted!.promoting, true, 'le halo de promotion doit se déclencher');
    assert.equal(promoted!.id, findAt(pieces, 3, 2)!.id, 'c’est bien la même pièce');
  });

  test('les pièces sorties sont retirées au tour suivant', () => {
    const withExiting: PieceView[] = [
      { id: 1, player: 'white', isKing: false, row: 0, col: 0, exiting: false, promoting: false },
      { id: 2, player: 'black', isKing: false, row: 1, col: 1, exiting: true, promoting: false },
    ];
    const kept = dropExiting(withExiting);
    assert.equal(kept.length, 1);
    assert.equal(kept[0].id, 1);
  });

  test('un changement de variante sort les pièces en trop', () => {
    const { pieces, nextId } = initialPieces(createGame('classic').board);
    // Sans coup pour relier les deux positions, les pièces qui occupent encore
    // la même case sont réutilisées ; les quatre du centre sortent du plateau.
    const after = reconcilePieces(pieces, createGame('open-center').board, null, nextId);

    const live = after.pieces.filter((piece) => !piece.exiting);
    const exiting = after.pieces.filter((piece) => piece.exiting);

    assert.equal(live.length, 20);
    assert.equal(exiting.length, 4);
    assert.ok(
      exiting.every((piece) => piece.row === 2),
      'seules les pièces de la rangée centrale disparaissent',
    );
  });
});
