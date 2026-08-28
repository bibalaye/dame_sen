import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_RULES,
  createGame,
  generateCapturesForPiece,
  generateMoves,
  generateQuietMovesForPiece,
  legalMoves,
  playMove,
  type Board,
  type GameState,
  type Player,
  type RuleSet,
  type Square,
} from '../engine.ts';

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

const gameWith = (
  rows: readonly string[],
  currentPlayer: Player,
  rules: Partial<RuleSet> = {},
): GameState => ({
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
  rules: { ...DEFAULT_RULES, ...rules },
});

describe('capture obligatoire', () => {
  const position = ['.....', '..w..', '..b..', '.....', 'w....'];

  test('activée, elle ne laisse que les prises', () => {
    const moves = legalMoves(gameWith(position, 'white'));
    assert.ok(moves.length > 0);
    assert.ok(moves.every((m) => m.captureRow !== undefined));
  });

  test('désactivée, le joueur garde le choix', () => {
    const moves = legalMoves(gameWith(position, 'white', { mandatoryCapture: false }));
    assert.ok(
      moves.some((m) => m.captureRow !== undefined),
      'la prise reste offerte',
    );
    assert.ok(
      moves.some((m) => m.captureRow === undefined),
      'un simple déplacement aussi',
    );
  });
});

describe('recul des pions', () => {
  const position = ['.....', '.....', '..w..', '.....', '.....'];

  test('interdit par défaut', () => {
    const cibles = generateQuietMovesForPiece(boardFrom(position), 2, 2).map(
      (m) => m.toRow,
    );
    assert.ok(!cibles.includes(1), 'le pion blanc ne redescend pas');
  });

  test('autorisé, il ouvre la case arrière', () => {
    const cibles = generateQuietMovesForPiece(boardFrom(position), 2, 2, {
      ...DEFAULT_RULES,
      backwardMove: true,
    }).map((m) => m.toRow);
    assert.ok(cibles.includes(1), 'le retour en arrière devient possible');
  });
});

describe('prise en arrière', () => {
  const position = ['.....', '.....', '..b..', '..w..', '.....'];

  test('interdite par défaut : la pièce dépassée est sauve', () => {
    assert.equal(generateCapturesForPiece(boardFrom(position), 3, 2).length, 0);
  });

  test('autorisée, le pion prend dans son dos', () => {
    const captures = generateCapturesForPiece(boardFrom(position), 3, 2, {
      ...DEFAULT_RULES,
      backwardCapture: true,
    });
    assert.equal(captures.length, 1);
    assert.equal(captures[0].captureRow, 2);
    assert.equal(captures[0].toRow, 1);
  });
});

describe('dame volante', () => {
  const position = ['.....', '.....', 'Wb...', '.....', '.....'];

  test('activée, elle choisit sa case d’arrivée', () => {
    const arrivees = generateCapturesForPiece(boardFrom(position), 2, 0)
      .map((m) => m.toCol)
      .sort();
    assert.deepEqual(arrivees, [2, 3, 4]);
  });

  test('désactivée, elle se pose juste derrière', () => {
    const arrivees = generateCapturesForPiece(boardFrom(position), 2, 0, {
      ...DEFAULT_RULES,
      flyingKing: false,
    }).map((m) => m.toCol);
    assert.deepEqual(arrivees, [2]);
  });
});

describe('dernière pièce promue', () => {
  const position = ['.....', '.....', '.bw..', '.....', 'b....'];
  const coup = {
    fromRow: 2,
    fromCol: 2,
    toRow: 2,
    toCol: 0,
    captureRow: 2,
    captureCol: 1,
  };

  test('activée, le survivant passe dame', () => {
    const next = playMove(gameWith(position, 'white'), coup);
    assert.equal(next.board[2][0]?.isKing, true);
    assert.equal(next.board[4][0]?.isKing, true);
  });

  test('désactivée, les pions restent des pions', () => {
    const next = playMove(
      gameWith(position, 'white', { loneSurvivorKing: false }),
      coup,
    );
    assert.equal(next.board[2][0]?.isKing, false);
    assert.equal(next.board[4][0]?.isKing, false);
  });
});

describe('promotion et rafle', () => {
  // Le pion prend en (3,0), devient dame en (4,0), et pourrait reprendre (4,1).
  const position = ['w....', '.....', 'w.b..', 'b....', '.b...'];
  const coup = {
    fromRow: 2,
    fromCol: 0,
    toRow: 4,
    toCol: 0,
    captureRow: 3,
    captureCol: 0,
  };

  test('par défaut, la rafle se poursuit', () => {
    const next = playMove(gameWith(position, 'white'), coup);
    assert.equal(next.lastPromotion, true);
    assert.equal(next.currentPlayer, 'white', 'le trait ne change pas');
  });

  test('avec la règle, devenir dame met fin au tour', () => {
    const next = playMove(
      gameWith(position, 'white', { promotionEndsTurn: true }),
      coup,
    );
    assert.equal(next.lastPromotion, true);
    assert.equal(next.currentPlayer, 'black', 'la main passe malgré la prise possible');
    assert.equal(next.chainFrom, null);
  });
});

describe('rafle maximale', () => {
  // Deux prises s'offrent : celle de (1,3) rapporte une pièce, celle de (2,0) deux.
  const position = ['.....', '...w.', 'wb.b.', '.....', '.....'];

  test('sans la règle, les deux prises sont permises', () => {
    const departs = new Set(
      legalMoves(gameWith(position, 'white')).map((m) => `${m.fromRow},${m.fromCol}`),
    );
    assert.equal(departs.size, 2, 'le joueur choisit sa prise');
  });

  test('avec la règle, seule la plus longue subsiste', () => {
    const moves = legalMoves(gameWith(position, 'white', { maximalCapture: true }));
    const departs = new Set(moves.map((m) => `${m.fromRow},${m.fromCol}`));

    assert.equal(departs.size, 1, 'une seule prise reste légale');
    assert.ok(departs.has('2,0'), 'celle qui enchaîne deux prises');
  });
});

describe('robustesse', () => {
  test('les règles voyagent avec la partie', () => {
    const rules: RuleSet = { ...DEFAULT_RULES, backwardMove: true, flyingKing: false };
    let state = createGame('open-center', 'white', rules);

    for (let i = 0; i < 6 && state.status.kind === 'playing'; i++) {
      const moves = legalMoves(state);
      if (moves.length === 0) break;
      state = playMove(state, moves[0]);
      assert.deepEqual(state.rules, rules, `règles perdues au coup ${i}`);
    }
  });

  test('une partie se termine quelles que soient les règles', () => {
    const variantes: Partial<RuleSet>[] = [
      {},
      { mandatoryCapture: false },
      { backwardMove: true, backwardCapture: true },
      { flyingKing: false },
      { loneSurvivorKing: false },
      { promotionEndsTurn: true },
      { maximalCapture: true },
    ];

    for (const partielles of variantes) {
      const rules = { ...DEFAULT_RULES, ...partielles };
      let state = createGame('open-center', 'white', rules);
      let tours = 0;

      while (state.status.kind === 'playing' && tours++ < 400) {
        const moves = generateMoves(state.board, state.currentPlayer, rules);
        if (moves.length === 0) break;
        const next = playMove(state, moves[tours % moves.length]);
        if (next === state) break;
        state = next;
      }

      assert.ok(tours < 400, `partie sans fin avec ${JSON.stringify(partielles)}`);
    }
  });
});
