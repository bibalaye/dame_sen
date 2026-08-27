import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { countPieces, legalMoves, playMove, serializeBoard } from '../engine.ts';
import {
  MAX_ATTEMPTS,
  applyResult,
  dailyNumber,
  dailyPuzzle,
  formatShare,
  maxCaptureChain,
  puzzleState,
  type DailyProgress,
} from '../daily.ts';

describe('numéro du jour', () => {
  test('il avance d’une unité par jour', () => {
    const first = dailyNumber(new Date(2026, 0, 1));
    const second = dailyNumber(new Date(2026, 0, 2));
    assert.equal(second, first + 1);
  });

  test('deux moments de la même journée donnent le même défi', () => {
    const morning = dailyNumber(new Date(2026, 5, 14, 7, 30));
    const evening = dailyNumber(new Date(2026, 5, 14, 23, 45));
    assert.equal(morning, evening);
  });

  test('il ne descend jamais sous 1', () => {
    assert.ok(dailyNumber(new Date(2020, 0, 1)) >= 1);
  });
});

describe('puzzle du jour', () => {
  test('le même numéro rend toujours la même position', () => {
    const a = dailyPuzzle(42);
    const b = dailyPuzzle(42);
    assert.equal(serializeBoard(a.board), serializeBoard(b.board));
    assert.equal(a.target, b.target);
  });

  test('deux jours voisins ne donnent pas la même position', () => {
    const a = serializeBoard(dailyPuzzle(100).board);
    const b = serializeBoard(dailyPuzzle(101).board);
    assert.notEqual(a, b);
  });

  test('chaque jour propose une rafle d’au moins deux prises', () => {
    for (let day = 1; day <= 60; day++) {
      const puzzle = dailyPuzzle(day);
      assert.ok(
        puzzle.target >= 2,
        `le défi n°${day} n'offre que ${puzzle.target} prise(s)`,
      );
    }
  });

  test('l’objectif annoncé est bien atteignable', () => {
    for (let day = 1; day <= 30; day++) {
      const puzzle = dailyPuzzle(day);
      let state = puzzleState(puzzle.board);
      let taken = 0;

      // On rejoue la meilleure rafle, prise après prise.
      while (state.status.kind === 'playing') {
        const captures = legalMoves(state).filter(
          (move) => move.captureRow !== undefined,
        );
        if (captures.length === 0) break;

        const best = captures
          .map((move) => {
            const next = playMove(state, move);
            const depth =
              next.currentPlayer === state.currentPlayer
                ? 1 + maxCaptureChain(next)
                : 1;
            return { move, depth };
          })
          .sort((a, b) => b.depth - a.depth)[0];

        const next = playMove(state, best.move);
        taken++;
        if (next.currentPlayer !== state.currentPlayer) {
          state = next;
          break;
        }
        state = next;
      }

      assert.equal(taken, puzzle.target, `objectif inatteignable au jour ${day}`);
    }
  });

  test('le joueur dispose de deux pièces, pour éviter la dame d’office', () => {
    for (let day = 1; day <= 30; day++) {
      const puzzle = dailyPuzzle(day);
      assert.ok(
        countPieces(puzzle.board, 'white') >= 2,
        `un seul pion blanc au jour ${day}`,
      );
    }
  });

  test('la position se génère vite', () => {
    const started = Date.now();
    for (let day = 1; day <= 40; day++) dailyPuzzle(day);
    const elapsed = Date.now() - started;
    assert.ok(elapsed < 2000, `génération trop lente : ${elapsed} ms`);
  });
});

describe('longueur de rafle', () => {
  test('une position sans prise vaut zéro', () => {
    const state = puzzleState([
      [null, null, null, null, null],
      [null, { player: 'white', isKing: false }, null, null, null],
      [null, null, null, null, null],
      [null, null, null, null, null],
      [null, null, null, null, null],
    ]);
    assert.equal(maxCaptureChain(state), 0);
  });

  test('elle compte l’enchaînement le plus long, pas le premier venu', () => {
    // À gauche une prise simple, à droite une prise double.
    const state = puzzleState([
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
      [{ player: 'white', isKing: false }, null, null, null, null],
    ]);
    assert.equal(maxCaptureChain(state), 2);
  });
});

describe('partage du résultat', () => {
  test('il montre la performance sans révéler la solution', () => {
    const text = formatShare(
      { number: 142, attempts: [2, 3], target: 3, solved: true },
      9,
    );

    assert.ok(text.includes('n°142'));
    assert.ok(text.includes(`2/${MAX_ATTEMPTS}`));
    assert.ok(text.includes('🟡🟡⬛'), 'le premier essai manque une prise');
    assert.ok(text.includes('🟡🟡🟡'), 'le second réussit');
    assert.ok(text.includes('Série : 9'));
    // Aucune coordonnée ne doit fuiter.
    assert.ok(!/[a-e][1-5]/.test(text));
  });

  test('un échec est marqué d’une croix', () => {
    const text = formatShare(
      { number: 7, attempts: [1, 1, 2], target: 3, solved: false },
      0,
    );
    assert.ok(text.includes('· X'));
    assert.ok(!text.includes('Série'));
  });
});

describe('série de jours', () => {
  const base: DailyProgress = { lastNumber: 10, streak: 4, solvedCount: 12 };

  test('résoudre le lendemain allonge la série', () => {
    const next = applyResult(base, 11, true);
    assert.equal(next.streak, 5);
    assert.equal(next.solvedCount, 13);
  });

  test('un jour sauté la remet à un', () => {
    const next = applyResult(base, 13, true);
    assert.equal(next.streak, 1);
  });

  test('un échec la remet à zéro', () => {
    const next = applyResult(base, 11, false);
    assert.equal(next.streak, 0);
    assert.equal(next.solvedCount, 12, 'un échec ne compte pas comme résolu');
  });

  test('rejouer le même jour ne change rien', () => {
    assert.equal(applyResult(base, 10, true), base);
  });
});

describe('cohérence des positions générées', () => {
  test('aucun pion ne stationne sur sa rangée de promotion', () => {
    for (let day = 1; day <= 120; day++) {
      const { board } = dailyPuzzle(day);

      for (let col = 0; col < 5; col++) {
        const top = board[4][col];
        const bottom = board[0][col];

        assert.ok(
          !(top?.player === 'white' && !top.isKing),
          `un pion blanc traîne en (4,${col}) au jour ${day} : il serait dame`,
        );
        assert.ok(
          !(bottom?.player === 'black' && !bottom.isKing),
          `un pion noir traîne en (0,${col}) au jour ${day} : il serait dame`,
        );
      }
    }
  });

  test('le camp adverse a toujours de quoi être pris', () => {
    for (let day = 1; day <= 60; day++) {
      const { board, target } = dailyPuzzle(day);
      assert.ok(countPieces(board, 'black') >= target);
    }
  });
});
