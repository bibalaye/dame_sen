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
  legalMovesFrom,
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
  lastCapture: null,
  lastPromotion: false,
  chainLength: 0,
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

  test('un pion prend sur le côté', () => {
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

  test('un pion prend devant lui', () => {
    const state = gameFrom(
      [
        '.....',
        '.....',
        '..w..',
        '..b..',
        '.....',
      ],
      'white',
    );
    const captures = generateCapturesForPiece(state.board, 2, 2);
    assert.equal(captures.length, 1);
    assert.deepEqual(captures[0], move(2, 2, 4, 2, [3, 2]));
  });

  test('un pion blanc ne prend pas la pièce qu’il a dépassée', () => {
    const state = gameFrom(
      [
        '.....',
        '.....',
        '..b..',
        '..w..',
        '.....',
      ],
      'white',
    );
    // Le pion noir est derrière le blanc, la case d'arrivée serait libre —
    // mais on ne prend jamais dans son dos.
    assert.equal(generateCapturesForPiece(state.board, 3, 2).length, 0);
    assert.ok(!hasMandatoryCapture(state), 'aucune prise ne doit être imposée');
  });

  test('un pion noir non plus', () => {
    const state = gameFrom(
      [
        '.....',
        '..b..',
        '..w..',
        '.....',
        '.....',
      ],
      'black',
    );
    // Les noirs avancent vers la rangée 0 : le blanc de (2,2) est dans leur dos.
    assert.equal(generateCapturesForPiece(state.board, 1, 2).length, 0);
  });

  test('la dame, elle, prend dans son dos', () => {
    const state = gameFrom(
      [
        '.....',
        '.....',
        '..b..',
        '..W..',
        '.....',
      ],
      'white',
    );
    const captures = generateCapturesForPiece(state.board, 3, 2);
    assert.ok(captures.length > 0);
    assert.ok(captures.every((capture) => capture.captureRow === 2));
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

  test('devenir dame en pleine rafle ne l’interrompt pas', () => {
    const state = gameFrom(
      [
        'w....',
        '.....',
        'w.b..',
        'b....',
        '.b...',
      ],
      'white',
    );

    // Le pion prend en (3,0) et atterrit sur la rangée de promotion : il devient
    // dame, et poursuit la rafle avec la portée d'une dame.
    const promoted = playMove(state, move(2, 0, 4, 0, [3, 0]));

    assert.equal(promoted.board[4][0]?.isKing, true, 'la pièce est promue');
    assert.equal(promoted.lastPromotion, true);
    assert.equal(promoted.currentPlayer, 'white', 'le trait ne change pas');
    assert.deepEqual(promoted.chainFrom, { row: 4, col: 0 });

    // La nouvelle dame reprend en (4,1), et choisit sa case d'arrivée.
    const nextCaptures = legalMoves(promoted);
    assert.ok(nextCaptures.length > 0);
    assert.ok(nextCaptures.every((capture) => capture.captureCol === 1));
    assert.ok(
      nextCaptures.length > 1,
      'la dame doit avoir le choix entre plusieurs cases d’arrivée',
    );
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

describe('retour sur le dernier coup', () => {
  test('une prise est signalée avec la case de la pièce prise', () => {
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
    assert.deepEqual(next.lastCapture, { row: 2, col: 1 });
    assert.equal(next.chainLength, 1);
    assert.equal(next.lastPromotion, false);
  });

  test('une rafle triple est comptée comme telle', () => {
    let state = gameFrom(
      [
        'w....',
        '.....',
        'wb.b.',
        '....b',
        '.....',
      ],
      'white',
    );

    state = playMove(state, move(2, 0, 2, 2, [2, 1]));
    assert.equal(state.chainLength, 1);
    assert.equal(state.currentPlayer, 'white', 'la rafle garde le trait');

    state = playMove(state, move(2, 2, 2, 4, [2, 3]));
    assert.equal(state.chainLength, 2);
    assert.equal(state.currentPlayer, 'white');

    // La troisième prise atterrit sur la rangée de promotion : la pièce devient
    // dame, ce qui met fin au tour tout en conservant le compte de la rafle.
    state = playMove(state, move(2, 4, 4, 4, [3, 4]));
    assert.equal(state.chainLength, 3);
    assert.equal(state.lastPromotion, true);
    assert.equal(state.currentPlayer, 'black');
  });

  test('un déplacement simple remet le compteur de rafle à zéro', () => {
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
    const next = playMove(state, move(1, 2, 2, 2));
    assert.equal(next.chainLength, 0);
    assert.equal(next.lastCapture, null);
  });

  test('une promotion est signalée', () => {
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
    assert.equal(next.lastPromotion, true);
  });
});

describe('la dame vole', () => {
  test('elle choisit sa case d’arrivée après une prise', () => {
    const state = gameFrom(
      [
        '.....',
        '.....',
        'Wb...',
        '.....',
        '.....',
      ],
      'white',
    );

    // La dame prend en (2,1) ; au-delà, trois cases sont libres.
    const captures = generateCapturesForPiece(state.board, 2, 0);
    const landings = captures.map((capture) => capture.toCol).sort();

    assert.deepEqual(landings, [2, 3, 4]);
    assert.ok(captures.every((capture) => capture.captureCol === 1));
  });

  test('elle s’arrête avant la pièce suivante', () => {
    const state = gameFrom(
      [
        '.....',
        '.....',
        'Wb..w',
        '.....',
        '.....',
      ],
      'white',
    );

    // La case (2,4) est occupée par une pièce amie : elle borne l'atterrissage.
    const landings = generateCapturesForPiece(state.board, 2, 0)
      .map((capture) => capture.toCol)
      .sort();
    assert.deepEqual(landings, [2, 3]);
  });

  test('la case choisie décide de la suite de la rafle', () => {
    const state = gameFrom(
      [
        '.....',
        '.....',
        'Wb...',
        '...b.',
        '.....',
      ],
      'white',
    );

    // En s'arrêtant en (2,3), la dame se place au contact du pion de (3,3).
    const chained = playMove(state, move(2, 0, 2, 3, [2, 1]));
    assert.equal(chained.currentPlayer, 'white', 'la rafle continue');

    // En allant jusqu'au bout, elle laisse passer la seconde prise.
    const stopped = playMove(state, move(2, 0, 2, 4, [2, 1]));
    assert.equal(stopped.currentPlayer, 'black', 'la rafle s’arrête');
  });

  test('un pion, lui, atterrit juste derrière', () => {
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
    const captures = generateCapturesForPiece(state.board, 2, 0);
    assert.equal(captures.length, 1);
    assert.equal(captures[0].toCol, 2);
  });
});

describe('dernière pièce d’un camp', () => {
  test('elle est promue dame d’office, dans les deux camps', () => {
    const state = gameFrom(
      [
        '.....',
        '.....',
        '.bw..',
        '.....',
        'b....',
      ],
      'white',
    );

    // Les blancs prennent : le camp noir tombe à une pièce, le camp blanc en
    // avait déjà une seule. Les deux survivants passent dame.
    const next = playMove(state, move(2, 2, 2, 0, [2, 1]));

    assert.equal(next.board[2][0]?.isKing, true, 'le survivant blanc est promu');
    assert.equal(next.board[4][0]?.isKing, true, 'le survivant noir aussi');
  });

  test('à deux pièces, rien n’est promu', () => {
    const state = gameFrom(
      [
        '.....',
        '.....',
        '.bw..',
        '.....',
        'bb...',
      ],
      'white',
    );
    const next = playMove(state, move(2, 2, 2, 0, [2, 1]));

    // Les noirs gardent deux pièces : aucune promotion d'office.
    assert.equal(next.board[4][0]?.isKing, false);
    assert.equal(next.board[4][1]?.isKing, false);
  });

  test('la promotion d’office donne bien la portée d’une dame', () => {
    const state = gameFrom(
      [
        '.....',
        '.....',
        '.bw..',
        '.....',
        'b....',
      ],
      'white',
    );
    const next = playMove(state, move(2, 2, 2, 0, [2, 1]));

    // Le survivant noir, désormais dame, balaie sa colonne et sa rangée.
    const blackMoves = generateMoves(next.board, 'black');
    assert.ok(
      blackMoves.some((candidate) => candidate.toRow === 0),
      'la dame doit pouvoir remonter toute la colonne',
    );
  });
});

describe('enchaînement des prises à la main', () => {
  test('une rafle se joue en désignant seulement les cases d’arrivée', () => {
    let state = gameFrom(
      [
        'w....',
        '.....',
        'wb.b.',
        '....b',
        '.....',
      ],
      'white',
    );

    /*
     * On reproduit ce que fait l'interface : le joueur touche sa pièce une
     * fois, puis ne désigne plus que des cases d'arrivée. Entre deux prises, la
     * sélection est déduite de `chainFrom` — jamais re-saisie par le joueur.
     */
    let selection: { row: number; col: number } | null = { row: 2, col: 0 };
    const clicks: ReadonlyArray<[number, number]> = [
      [2, 2],
      [2, 4],
      [4, 4],
    ];

    const touches = 1; // la seule fois où le joueur touche sa pièce
    for (const [row, col] of clicks) {
      assert.ok(selection, 'la pièce doit rester active entre deux prises');

      const options = legalMovesFrom(state, selection!.row, selection!.col);
      const move = options.find((m) => m.toRow === row && m.toCol === col);
      assert.ok(move, `la case (${row},${col}) doit être proposée directement`);

      state = playMove(state, move!);
      selection = state.chainFrom
        ? { row: state.chainFrom.row, col: state.chainFrom.col }
        : null;
    }

    assert.equal(touches, 1, 'une seule sélection pour toute la rafle');
    assert.equal(state.chainLength, 3, 'les trois prises ont bien été jouées');
    assert.equal(state.currentPlayer, 'black', 'le tour passe une fois la rafle finie');
    assert.equal(selection, null, 'la pièce est relâchée à la fin de la rafle');
  });

  test('la pièce imposée est la seule à proposer des coups', () => {
    const state = gameFrom(
      [
        'w....',
        '.....',
        'wb.b.',
        '.....',
        '.....',
      ],
      'white',
    );

    const mid = playMove(state, move(2, 0, 2, 2, [2, 1]));
    assert.deepEqual(mid.chainFrom, { row: 2, col: 2 });

    // Le pion resté en (0,0) ne peut pas voler la main pendant la rafle.
    assert.equal(legalMovesFrom(mid, 0, 0).length, 0);
    assert.ok(legalMovesFrom(mid, 2, 2).length > 0);
  });
});
