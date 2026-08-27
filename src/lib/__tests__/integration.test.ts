import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { countPieces, createGame, playMove, type GameState } from '../engine.ts';
import { findBestMove } from '../ai.ts';
import {
  dropExiting,
  initialPieces,
  reconcilePieces,
  type PieceView,
} from '../pieceLayer.ts';
import {
  createClock,
  flaggedPlayer,
  startClock,
  switchClock,
  type ClockState,
} from '../clock.ts';

/**
 * Ce test rejoue ce que fait l'interface à chaque coup : jouer sur le moteur,
 * réconcilier la couche de pièces, faire tourner la pendule. Il vérifie que les
 * trois modules restent cohérents entre eux sur une partie entière — ce qu'un
 * test unitaire de chacun pris isolément ne montre pas.
 */
describe('partie complète, moteur et affichage', () => {
  test('les pièces affichées correspondent toujours au plateau', () => {
    let game: GameState = createGame('open-center');
    let layer = initialPieces(game.board);
    let pieces: readonly PieceView[] = layer.pieces;
    let nextId = layer.nextId;

    let turns = 0;
    const seenIds = new Set<number>(pieces.map((piece) => piece.id));

    while (game.status.kind === 'playing' && turns < 300) {
      const { move } = findBestMove(game, turns % 2 === 0 ? 'medium' : 'easy');
      assert.ok(move, 'une partie en cours offre toujours un coup');

      const next = playMove(game, move!);
      assert.notEqual(next, game, 'le coup doit être accepté');

      // L'interface repart des pièces encore présentes, comme le composant.
      layer = reconcilePieces(dropExiting(pieces), next.board, next.lastMove, nextId);
      pieces = layer.pieces;
      nextId = layer.nextId;

      const live = pieces.filter((piece) => !piece.exiting);
      const exiting = pieces.filter((piece) => piece.exiting);

      // Autant de pièces à l'écran que sur le plateau.
      assert.equal(
        live.length,
        countPieces(next.board, 'white') + countPieces(next.board, 'black'),
        `désaccord entre le plateau et l'affichage au coup ${turns}`,
      );

      // Chaque pièce vivante est bien là où le moteur la place.
      for (const piece of live) {
        const square = next.board[piece.row][piece.col];
        assert.ok(square, `pièce affichée sur une case vide au coup ${turns}`);
        assert.equal(square!.player, piece.player);
        assert.equal(square!.isKing, piece.isKing);
      }

      // Une prise, et une seule, produit une pièce en sortie.
      assert.equal(
        exiting.length,
        next.lastCapture ? 1 : 0,
        `sortie de pièce incohérente au coup ${turns}`,
      );

      // Deux pièces ne partagent jamais un identifiant.
      assert.equal(new Set(live.map((piece) => piece.id)).size, live.length);
      live.forEach((piece) => seenIds.add(piece.id));

      game = next;
      turns++;
    }

    assert.notEqual(game.status.kind, 'playing', 'la partie doit se terminer');
    assert.ok(turns > 5, 'la partie doit durer plus que quelques coups');
  });

  test('un identifiant ne resservira jamais pour une autre pièce', () => {
    let game = createGame('open-center');
    let layer = initialPieces(game.board);
    let pieces: readonly PieceView[] = layer.pieces;

    // Couleur associée à chaque identifiant : elle ne doit jamais changer.
    const owners = new Map<number, string>();
    pieces.forEach((piece) => owners.set(piece.id, piece.player));

    for (let i = 0; i < 40 && game.status.kind === 'playing'; i++) {
      const { move } = findBestMove(game, 'easy');
      if (!move) break;

      game = playMove(game, move);
      layer = reconcilePieces(dropExiting(pieces), game.board, game.lastMove, layer.nextId);
      pieces = layer.pieces;

      for (const piece of pieces) {
        const known = owners.get(piece.id);
        if (known === undefined) {
          owners.set(piece.id, piece.player);
        } else {
          assert.equal(known, piece.player, `l'identifiant ${piece.id} a changé de camp`);
        }
      }
    }
  });

  test('la pendule suit les coups et finit par tomber', () => {
    let game = createGame('open-center');
    let clock: ClockState = createClock('bullet', 0);
    clock = startClock(clock, 'white', 0);

    let now = 0;
    let flagged = flaggedPlayer(clock);

    while (game.status.kind === 'playing' && !flagged && now < 300_000) {
      const before = game.currentPlayer;
      const { move } = findBestMove(game, 'easy');
      if (!move) break;

      const next = playMove(game, move);
      // Chaque coup consomme cinq secondes de réflexion.
      now += 5_000;

      if (next.currentPlayer !== before) {
        clock = switchClock(clock, before, next.currentPlayer, now);
      }

      game = next;
      flagged = flaggedPlayer(clock);
    }

    // En éclair, sans incrément, une partie de ce rythme finit au drapeau.
    assert.ok(
      flagged !== null || game.status.kind !== 'playing',
      'la partie doit se terminer, au drapeau ou sur le plateau',
    );

    if (flagged) {
      assert.equal(clock.remaining[flagged], 0);
      assert.equal(clock.running, null, 'la pendule s’arrête au drapeau');
    }
  });

  test('une rafle laisse la pendule au même joueur', () => {
    // Position construite pour offrir une prise enchaînée aux blancs.
    const game: GameState = {
      ...createGame('open-center'),
      board: [
        [null, null, null, null, null],
        [null, null, null, null, null],
        [
          { player: 'white', isKing: false },
          { player: 'black', isKing: false },
          null,
          { player: 'black', isKing: false },
          null,
        ],
        [null, null, null, null, null],
        [null, null, null, null, null],
      ],
      currentPlayer: 'white',
      positionCounts: {},
    };

    let clock = startClock(createClock('blitz', 0), 'white', 0);
    const before = game.currentPlayer;

    const mid = playMove(game, {
      fromRow: 2,
      fromCol: 0,
      toRow: 2,
      toCol: 2,
      captureRow: 2,
      captureCol: 1,
    });

    assert.equal(mid.currentPlayer, 'white', 'la rafle garde le trait');

    // Le trait n'ayant pas changé, la pendule ne bascule pas.
    if (mid.currentPlayer !== before) {
      clock = switchClock(clock, before, mid.currentPlayer, 3_000);
    }
    assert.equal(clock.running, 'white');
    assert.equal(clock.remaining.white, 180_000, 'aucun incrément en cours de rafle');
  });
});
