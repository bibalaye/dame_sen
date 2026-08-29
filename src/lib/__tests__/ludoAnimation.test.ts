import test from 'node:test';
import assert from 'node:assert/strict';

import { createLudoGame, rollInto, playLudoMove, type LudoMove } from '../ludo.ts';
import { getMovePath, cellOfPawn } from '../ludoAnimation.ts';
import { TRACK_CELLS, startCell } from '../ludoBoard.ts';

test('animation: calcul des chemins', async (t) => {
  await t.test('sortie d’écurie', () => {
    const game = createLudoGame(4);
    const move: LudoMove = {
      kind: 'enter',
      pawn: 0,
      die: 6,
      to: { zone: 'track', square: 0 },
    };

    const path = getMovePath(game, move);
    assert.equal(path.length, 2);
    assert.deepEqual(path[1], startCell(0));
  });

  await t.test('avance sur le circuit', () => {
    let game = createLudoGame(4);
    game = rollInto(game, [6, 4]);
    game = playLudoMove(game, {
      kind: 'enter',
      pawn: 0,
      die: 6,
      to: { zone: 'track', square: 0 },
    });

    const advanceMove: LudoMove = {
      kind: 'advance',
      pawn: 0,
      die: 4,
      to: { zone: 'track', square: 4 },
    };

    const path = getMovePath(game, advanceMove);
    assert.equal(path.length, 5); // position de départ + 4 cases
    assert.deepEqual(path[0], TRACK_CELLS[0]);
    assert.deepEqual(path[1], TRACK_CELLS[1]);
    assert.deepEqual(path[2], TRACK_CELLS[2]);
    assert.deepEqual(path[3], TRACK_CELLS[3]);
    assert.deepEqual(path[4], TRACK_CELLS[4]);

    const pos = cellOfPawn(game, 0);
    assert.deepEqual(pos, TRACK_CELLS[0]);
  });
});
