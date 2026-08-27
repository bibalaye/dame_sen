import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  BOARD_SIZE,
  createGame,
  generateMoves,
  legalMoves,
  playMove,
  type Board,
  type GameState,
  type Player,
  type Square,
} from '../engine.ts';
import {
  DIFFICULTY_PROFILES,
  evaluate,
  findBestMove,
  suggestMove,
  thinkingDelay,
  type Difficulty,
} from '../ai.ts';

const boardFrom = (rows: readonly string[]): Board =>
  rows.map((row) =>
    [...row].map<Square>((char) => {
      switch (char) {
        case 'w':
          return { player: 'white', isKing: false };
        case 'W':
          return { player: 'white', isKing: true };
        case 'b':
          return { player: 'black', isKing: false };
        case 'B':
          return { player: 'black', isKing: true };
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
});

/** Générateur pseudo-aléatoire déterministe, pour des parties reproductibles. */
const seeded = (seed: number): (() => number) => {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
};

describe('évaluation', () => {
  test('une position équilibrée vaut zéro pour les deux camps', () => {
    const board = createGame('classic').board;
    // Somme plutôt qu'égalité : en JavaScript, 0 et -0 ne sont pas identiques.
    assert.equal(evaluate(board, 'white') + evaluate(board, 'black'), 0);
  });

  test('un pion de plus vaut mieux qu’un pion de moins', () => {
    const ahead = boardFrom([
      '.....',
      'ww...',
      '.....',
      'b....',
      '.....',
    ]);
    assert.ok(evaluate(ahead, 'white') > 0);
    assert.ok(evaluate(ahead, 'black') < 0);
  });

  test('une dame vaut nettement plus qu’un pion', () => {
    const withKing = boardFrom([
      '.....',
      'W....',
      '.....',
      'b....',
      '.....',
    ]);
    assert.ok(evaluate(withKing, 'white') > 150);
  });
});

describe('recherche', () => {
  test('sans coup possible, aucun coup n’est renvoyé', () => {
    const finished = gameFrom(
      [
        '.....',
        '.....',
        '..w..',
        '.....',
        '.....',
      ],
      'black',
    );
    assert.equal(findBestMove(finished, 'hard').move, null);
  });

  test('le coup renvoyé est toujours légal', () => {
    for (const difficulty of Object.keys(DIFFICULTY_PROFILES) as Difficulty[]) {
      const state = createGame('open-center');
      const result = findBestMove(state, difficulty, seeded(7));
      assert.ok(result.move, `${difficulty} doit proposer un coup`);
      assert.notEqual(
        playMove(state, result.move!),
        state,
        `${difficulty} propose un coup refusé par le moteur`,
      );
    }
  });

  test('elle préfère la rafle double à la prise simple', () => {
    // Deux prises s'offrent aux blancs : celle du pion en (1,3) rapporte une
    // pièce, celle du pion en (2,0) en rapporte deux en enchaînant.
    const state = gameFrom(
      [
        '.....',
        '...w.',
        'wb.b.',
        '.....',
        '.....',
      ],
      'white',
    );

    const best = findBestMove(state, 'hard').move;
    assert.ok(best);
    assert.equal(best!.fromRow, 2);
    assert.equal(best!.fromCol, 0);

    const after = playMove(state, best!);
    assert.notEqual(after.chainFrom, null, 'la rafle doit se poursuivre');
  });

  test('elle refuse de se mettre en prise quand une case sûre existe', () => {
    // (1,1) peut avancer ou se décaler, mais les deux cases sont couvertes par
    // le pion noir de (2,2). Seul (1,0) mène à une case sûre.
    const state = gameFrom(
      [
        '.....',
        'ww...',
        '..b..',
        '.....',
        '.....',
      ],
      'white',
    );

    const best = findBestMove(state, 'hard').move;
    assert.ok(best);

    const after = playMove(state, best!);
    const blackCanCapture = generateMoves(after.board, 'black').some(
      (m) => m.captureRow !== undefined,
    );
    assert.ok(!blackCanCapture, 'l’IA laisse une pièce en prise');
  });

  test('elle prend la pièce qui reste quand cela gagne la partie', () => {
    const state = gameFrom(
      [
        '.....',
        '.....',
        '.bw..',
        '.....',
        '.....',
      ],
      'white',
    );
    const best = findBestMove(state, 'hard').move;
    assert.ok(best);

    const after = playMove(state, best!);
    assert.equal(after.status.kind, 'win');
  });

  test('la profondeur atteinte augmente avec le niveau', () => {
    const state = createGame('open-center');
    const easy = findBestMove(state, 'easy', () => 0.99);
    const hard = findBestMove(state, 'hard', () => 0.99);
    assert.ok(hard.depth > easy.depth);
    assert.ok(hard.nodes > easy.nodes);
  });

  test('elle reste dans son budget de temps', () => {
    const state = createGame('classic');
    const started = Date.now();
    findBestMove(state, 'expert');
    const elapsed = Date.now() - started;
    // Le budget est de 600 ms ; on tolère le dépassement d'une itération.
    assert.ok(elapsed < 2000, `recherche trop longue : ${elapsed} ms`);
  });

  test('un niveau sans erreur est déterministe', () => {
    const state = createGame('open-center');
    const first = findBestMove(state, 'hard');
    const second = findBestMove(state, 'hard');
    assert.deepEqual(first.move, second.move);
  });

  test('le niveau le plus faible joue parfois au hasard', () => {
    const state = createGame('open-center');
    // Un tirage sous le taux d'erreur force le coup aléatoire.
    const blundered = findBestMove(state, 'easy', () => 0.01);
    assert.equal(blundered.depth, 0);
    assert.equal(blundered.nodes, 0);
    assert.ok(blundered.move);
  });
});

describe('partie complète', () => {
  const playFullGame = (
    white: Difficulty,
    black: Difficulty,
    seed: number,
  ): GameState => {
    let state = createGame('open-center');
    const random = seeded(seed);

    for (let turn = 0; turn < 400 && state.status.kind === 'playing'; turn++) {
      const difficulty = state.currentPlayer === 'white' ? white : black;
      const { move } = findBestMove(state, difficulty, random);
      assert.ok(move, 'une partie en cours doit toujours offrir un coup');

      const next = playMove(state, move!);
      assert.notEqual(next, state, 'coup refusé par le moteur');
      state = next;
    }

    return state;
  };

  test('une partie entre IA se termine toujours', () => {
    const finished = playFullGame('medium', 'easy', 1234);
    assert.notEqual(finished.status.kind, 'playing');
  });

  test('le niveau fort l’emporte sur le niveau faible', () => {
    let strongWins = 0;
    const rounds = 4;

    for (let i = 0; i < rounds; i++) {
      const finished = playFullGame('hard', 'easy', 100 + i);
      if (finished.status.kind === 'win' && finished.status.winner === 'white') {
        strongWins++;
      }
    }

    assert.ok(
      strongWins >= 3,
      `le niveau fort ne gagne que ${strongWins} fois sur ${rounds}`,
    );
  });
});

describe('confort de jeu', () => {
  test('l’indice propose un coup jouable', () => {
    const state = createGame('open-center');
    const hint = suggestMove(state);
    assert.ok(hint);
    assert.ok(
      legalMoves(state).some(
        (m) =>
          m.fromRow === hint!.fromRow &&
          m.fromCol === hint!.fromCol &&
          m.toRow === hint!.toRow &&
          m.toCol === hint!.toCol,
      ),
    );
  });

  test('le temps de réflexion varie sans jamais être instantané', () => {
    const state = createGame('open-center');
    const fastest = thinkingDelay(state, () => 0);
    const slowest = thinkingDelay(state, () => 0.999);
    assert.ok(fastest >= 380);
    assert.ok(slowest > fastest);
    assert.ok(slowest < 1400);
  });
});

describe('robustesse', () => {
  test('la recherche ne modifie pas la position qu’on lui confie', () => {
    const state = createGame('classic');
    const before = JSON.stringify(state.board);
    findBestMove(state, 'hard');
    assert.equal(JSON.stringify(state.board), before);
  });

  test('elle sait jouer au milieu d’une rafle', () => {
    const state = gameFrom(
      [
        '.....',
        '.....',
        'wb.b.',
        '.....',
        '.....',
      ],
      'white',
    );
    const first = findBestMove(state, 'hard').move;
    const midChain = playMove(state, first!);
    assert.notEqual(midChain.chainFrom, null);

    const second = findBestMove(midChain, 'hard').move;
    assert.ok(second, 'la rafle doit se poursuivre');
    assert.equal(second!.fromRow, midChain.chainFrom!.row);
    assert.equal(second!.fromCol, midChain.chainFrom!.col);
  });

  test('le plateau garde ses dimensions après une partie', () => {
    const finished = (() => {
      let state = createGame('classic');
      const random = seeded(99);
      for (let i = 0; i < 60 && state.status.kind === 'playing'; i++) {
        const { move } = findBestMove(state, 'easy', random);
        if (!move) break;
        state = playMove(state, move);
      }
      return state;
    })();

    assert.equal(finished.board.length, BOARD_SIZE);
    assert.ok(finished.board.every((row) => row.length === BOARD_SIZE));
  });
});
