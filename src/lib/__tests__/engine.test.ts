import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  BOARD_SIZE,
  countPieces,
  createBoard,
  createGame,
  generateCapturesForPiece,
  generateMoves,
  hasMandatoryCapture,
  legalMoves,
  movablePositions,
  playMove,
  serializeBoard,
  type Board,
  type GameState,
  type Move,
  type Player,
  type Square,
} from '../engine.ts';

/**
 * Construit un plateau à partir d'un croquis, une ligne par rangée :
 * `.` case vide, `w`/`b` pion, `W`/`B` dame. La rangée 0 (camp blanc) est
 * écrite en premier.
 */
const boardFrom = (rows: readonly string[]): Board => {
  assert.equal(rows.length, BOARD_SIZE, 'le croquis doit avoir 5 rangées');
  return rows.map((row) => {
    assert.equal(row.length, BOARD_SIZE, 'chaque rangée doit avoir 5 cases');
    return [...row].map<Square>((char) => {
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
    });
  });
};

const gameFrom = (rows: readonly string[], currentPlayer: Player): GameState => ({
  board: boardFrom(rows),
  currentPlayer,
  chainFrom: null,
  halfmoveClock: 0,
  positionCounts: {},
  status: { kind: 'playing' },
  lastMove: null,
});

const move = (
  fromRow: number,
  fromCol: number,
  toRow: number,
  toCol: number,
  capture?: readonly [number, number],
): Move =>
  capture
    ? {
        fromRow,
        fromCol,
        toRow,
        toCol,
        captureRow: capture[0],
        captureCol: capture[1],
      }
    : { fromRow, fromCol, toRow, toCol };

describe('position de départ', () => {
  test('la disposition historique laisse une seule case libre', () => {
    const board = createBoard('classic');
    assert.equal(countPieces(board, 'white'), 12);
    assert.equal(countPieces(board, 'black'), 12);
    assert.equal(serializeBoard(board).split('').filter((c) => c === '.').length, 1);
  });

  test("elle n'offre que deux coups au premier joueur", () => {
    const moves = generateMoves(createBoard('classic'), 'white');
    assert.equal(moves.length, 2);
    // Les deux coups mènent à la même case, la seule libre du plateau.
    assert.ok(moves.every((m) => m.toRow === 2 && m.toCol === 2));
  });

  test('vider la rangée centrale porte l’ouverture à cinq coups', () => {
    const board = createBoard('open-center');
    assert.equal(countPieces(board, 'white'), 10);
    assert.equal(countPieces(board, 'black'), 10);
    assert.equal(generateMoves(board, 'white').length, 5);
  });

  test('la variante à poser laisse deux pièces à placer par camp', () => {
    const board = createBoard('free-drop');
    // Huit pièces posées d'office, deux libres : dix une fois la pose terminée.
    assert.equal(countPieces(board, 'white'), 8);
    assert.equal(countPieces(board, 'black'), 8);
  });
});

describe('déplacements', () => {
  test('un pion avance, se décale, et ne recule jamais', () => {
    const state = gameFrom(
      [
        '.....',
        '..w..',
        '.....',
        '.....',
        '.....',
      ],
      'white',
    );
    const destinations = legalMoves(state)
      .map((m) => `${m.toRow}${m.toCol}`)
      .sort();
    // Avance en (2,2), décalages en (1,1) et (1,3) — mais pas de retour en (0,2).
    assert.deepEqual(destinations, ['11', '13', '22']);
  });

  test('un pion noir avance dans l’autre sens', () => {
    const state = gameFrom(
      [
        '.....',
        '.....',
        '..b..',
        '.....',
        '.....',
      ],
      'black',
    );
    assert.ok(legalMoves(state).some((m) => m.toRow === 1 && m.toCol === 2));
    assert.ok(!legalMoves(state).some((m) => m.toRow === 3));
  });

  test('une dame glisse sur toute sa ligne dans les quatre sens', () => {
    const state = gameFrom(
      [
        '.....',
        '.....',
        '..W..',
        '.....',
        '.....',
      ],
      'white',
    );
    assert.equal(legalMoves(state).length, 8);
  });

  test('une dame est arrêtée par la première pièce rencontrée', () => {
    const state = gameFrom(
      [
        '.....',
        '.....',
        '..Ww.',
        '.....',
        '.....',
      ],
      'white',
    );
    const kingMoves = legalMoves(state).filter(
      (m) => m.fromRow === 2 && m.fromCol === 2,
    );
    assert.ok(!kingMoves.some((m) => m.toRow === 2 && m.toCol > 2));
  });
});

describe('captures', () => {
  test('la prise est obligatoire dès qu’elle existe', () => {
    const state = gameFrom(
      [
        '.....',
        '..w..',
        '..b..',
        '.....',
        'w....',
      ],
      'white',
    );
    const moves = legalMoves(state);
    assert.ok(moves.length > 0);
    assert.ok(
      moves.every((m) => m.captureRow !== undefined),
      'aucun déplacement simple ne doit rester légal',
    );
    assert.ok(hasMandatoryCapture(state));
  });

  test('un pion prend dans les quatre directions, en arrière comprise', () => {
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
    const captures = generateCapturesForPiece(state.board, 2, 2);
    assert.equal(captures.length, 1);
    assert.deepEqual(captures[0], move(2, 2, 2, 0, [2, 1]));
  });

  test('la prise est refusée si la case d’arrivée est occupée', () => {
    const state = gameFrom(
      [
        '.....',
        '.....',
        'wbw..',
        '.....',
        '.....',
      ],
      'white',
    );
    assert.equal(generateCapturesForPiece(state.board, 2, 2).length, 0);
  });

  test('une dame prend à distance et atterrit derrière la pièce', () => {
    const state = gameFrom(
      [
        '.....',
        '.....',
        'W..b.',
        '.....',
        '.....',
      ],
      'white',
    );
    const captures = generateCapturesForPiece(state.board, 2, 0);
    assert.equal(captures.length, 1);
    assert.deepEqual(captures[0], move(2, 0, 2, 4, [2, 3]));
  });

  test('la pièce capturée disparaît du plateau', () => {
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
    const next = playMove(state, move(2, 2, 2, 0, [2, 1]));
    assert.equal(next.board[2][1], null);
    assert.equal(countPieces(next.board, 'black'), 0);
  });

  test('le plateau reçu n’est jamais modifié', () => {
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
    const before = serializeBoard(state.board);
    playMove(state, move(2, 2, 2, 0, [2, 1]));
    assert.equal(serializeBoard(state.board), before);
  });
});

describe('rafles', () => {
  test('le trait reste au joueur tant qu’il peut reprendre', () => {
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
    const next = playMove(state, move(2, 0, 2, 2, [2, 1]));

    assert.equal(next.currentPlayer, 'white', 'le trait ne doit pas changer');
    assert.deepEqual(next.chainFrom, { row: 2, col: 2 });
    assert.ok(
      legalMoves(next).every((m) => m.fromRow === 2 && m.fromCol === 2),
      'seule la pièce qui vient de prendre peut jouer',
    );
  });

  test('la rafle s’arrête quand plus rien n’est à prendre', () => {
    const state = gameFrom(
      [
        '.....',
        '.....',
        'wb...',
        '.....',
        '.....',
      ],
      'white',
    );
    const next = playMove(state, move(2, 0, 2, 2, [2, 1]));
    assert.equal(next.currentPlayer, 'black');
    assert.equal(next.chainFrom, null);
  });

  test('une promotion met fin au tour même si une prise reste possible', () => {
    const state = gameFrom(
      [
        '.....',
        '.....',
        'w.b..',
        'b....',
        '.b...',
      ],
      'white',
    );

    // Le pion prend en (3,0), atterrit sur la rangée de promotion et devient
    // dame. Sans la règle, cette dame pourrait reprendre en (4,1).
    const promoted = playMove(state, move(2, 0, 4, 0, [3, 0]));

    assert.equal(promoted.board[4][0]?.isKing, true);
    assert.equal(promoted.currentPlayer, 'black', 'la promotion rend la main');
    assert.equal(promoted.chainFrom, null);
  });
});

describe('promotion', () => {
  test('un pion blanc devient dame sur la dernière rangée', () => {
    const state = gameFrom(
      [
        '.....',
        '.....',
        '.....',
        '..w..',
        '.....',
      ],
      'white',
    );
    const next = playMove(state, move(3, 2, 4, 2));
    assert.deepEqual(next.board[4][2], { player: 'white', isKing: true });
  });

  test('un pion noir devient dame sur la rangée zéro', () => {
    const state = gameFrom(
      [
        '.....',
        '..b..',
        '.....',
        '.....',
        '.....',
      ],
      'black',
    );
    const next = playMove(state, move(1, 2, 0, 2));
    assert.deepEqual(next.board[0][2], { player: 'black', isKing: true });
  });

  test('une dame ne repasse pas par la promotion', () => {
    const state = gameFrom(
      [
        '.....',
        '.....',
        '.....',
        '..W..',
        '.....',
      ],
      'white',
    );
    const next = playMove(state, move(3, 2, 4, 2));
    assert.equal(next.board[4][2]?.isKing, true);
  });
});

describe('fin de partie', () => {
  test('la victoire est détectée dès la dernière pièce prise', () => {
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
    const next = playMove(state, move(2, 2, 2, 0, [2, 1]));
    assert.deepEqual(next.status, { kind: 'win', winner: 'white', reason: 'capture' });
  });

  test('un joueur sans coup légal perd par blocage', () => {
    const state = gameFrom(
      [
        'wBB..',
        'b....',
        '.....',
        'b....',
        '.....',
      ],
      'black',
    );
    // Les noirs avancent en (2,0) : le pion blanc du coin n'a plus ni case
    // libre où aller, ni prise possible (toutes les arrivées sont occupées).
    const next = playMove(state, move(3, 0, 2, 0));
    assert.equal(next.status.kind, 'win');
    if (next.status.kind === 'win') {
      assert.equal(next.status.winner, 'black');
      assert.equal(next.status.reason, 'block');
    }
  });

  test('aucun coup n’est légal une fois la partie terminée', () => {
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
    const finished = playMove(state, move(2, 2, 2, 0, [2, 1]));
    assert.equal(legalMoves(finished).length, 0);
    assert.equal(playMove(finished, move(2, 0, 2, 1)), finished);
  });
});

describe('nulles', () => {
  test('la partie est nulle après 25 coups sans prise ni promotion', () => {
    // Deux dames qui se tournent autour sans jamais se rencontrer.
    let state = gameFrom(
      [
        'W....',
        '.....',
        '.....',
        '.....',
        '....B',
      ],
      'white',
    );

    const shuttle: readonly Move[] = [
      move(0, 0, 0, 1),
      move(4, 4, 4, 3),
      move(0, 1, 0, 0),
      move(4, 3, 4, 4),
    ];

    for (let i = 0; i < 60 && state.status.kind === 'playing'; i++) {
      state = playMove(state, shuttle[i % shuttle.length]);
    }

    assert.equal(state.status.kind, 'draw');
  });

  test('la triple répétition arrête la partie', () => {
    const game = createGame('open-center');
    // Sans prise possible, un aller-retour de dames répète la position.
    let state: GameState = {
      ...game,
      board: boardFrom([
        'W....',
        '.....',
        '..w..',
        '.....',
        '....B',
      ]),
      positionCounts: {},
    };

    const cycle: readonly Move[] = [
      move(0, 0, 0, 1),
      move(4, 4, 4, 3),
      move(0, 1, 0, 0),
      move(4, 3, 4, 4),
    ];

    let repeated = false;
    for (let i = 0; i < 12 && state.status.kind === 'playing'; i++) {
      state = playMove(state, cycle[i % cycle.length]);
      if (state.status.kind === 'draw' && state.status.reason === 'repetition') {
        repeated = true;
        break;
      }
    }

    assert.ok(repeated, 'la répétition doit être détectée avant la règle des 25 coups');
  });

  test('une prise remet le compteur d’inaction à zéro', () => {
    const state: GameState = {
      ...gameFrom(
        [
          '.....',
          '.....',
          '.bw..',
          '.....',
          '.w...',
        ],
        'white',
      ),
      halfmoveClock: 40,
    };
    const next = playMove(state, move(2, 2, 2, 0, [2, 1]));
    assert.equal(next.halfmoveClock, 0);
  });
});

describe('coups illégaux', () => {
  test('un coup absent de la liste légale ne change rien', () => {
    const state = gameFrom(
      [
        '.....',
        '..w..',
        '.....',
        '.....',
        '.....',
      ],
      'white',
    );
    // Un pion ne recule pas.
    assert.equal(playMove(state, move(1, 2, 0, 2)), state);
  });

  test('jouer une pièce adverse est refusé', () => {
    const state = gameFrom(
      [
        '.....',
        '..w..',
        '.....',
        '..b..',
        '.....',
      ],
      'white',
    );
    assert.equal(playMove(state, move(3, 2, 2, 2)), state);
  });

  test('les cases jouables sont celles des coups légaux', () => {
    const state = gameFrom(
      [
        '.....',
        '..w..',
        '..b..',
        '.....',
        'w....',
      ],
      'white',
    );
    // Prise obligatoire : seul le pion en (1,2) peut jouer.
    assert.deepEqual(movablePositions(state), [{ row: 1, col: 2 }]);
  });
});
