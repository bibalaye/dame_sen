import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  MORPION_OPPONENTS,
  NO_WIN_LIMIT,
  PIECES_PER_PLAYER,
  availableMoves,
  bestMove,
  createMorpion,
  findBestMorpionMove,
  findWinningLine,
  morpionThinkingDelay,
  other,
  playMorpion,
  serializeGrid,
  type Grid,
  type Mark,
  type MorpionDifficulty,
  type MorpionMove,
  type MorpionState,
} from '../morpion.ts';

/** Grille depuis un croquis : `.` vide, `X` et `O` les deux camps. */
const gridFrom = (rows: string): Grid =>
  [...rows.replace(/\s/g, '')].map((c) => (c === '.' ? null : (c as Mark)));

/** Position de phase 2 : les six pions sont posés. */
const movementState = (rows: string, current: Mark): MorpionState => {
  const grid = gridFrom(rows);
  return {
    grid,
    current,
    phase: 'movement',
    placed: { X: PIECES_PER_PLAYER, O: PIECES_PER_PLAYER },
    status: { kind: 'playing' },
    lastMove: null,
    idleMoves: 0,
    positionCounts: {},
  };
};

const place = (to: number): MorpionMove => ({ type: 'place', to });
const move = (from: number, to: number): MorpionMove => ({ type: 'move', from, to });

const seeded = (seed: number): (() => number) => {
  let v = seed >>> 0;
  return () => (v = (v * 1664525 + 1013904223) >>> 0) / 0x100000000;
};

/** Déroule une partie entre deux niveaux et renvoie l'état final. */
const playOut = (
  x: MorpionDifficulty,
  o: MorpionDifficulty,
  seed: number,
): MorpionState => {
  const random = seeded(seed);
  let state = createMorpion('X');
  let guard = 0;

  while (state.status.kind === 'playing' && guard++ < 300) {
    const next = findBestMorpionMove(state, state.current === 'X' ? x : o, random);
    if (!next) break;
    state = playMorpion(state, next);
  }
  return state;
};

describe('phase de pose', () => {
  test('la partie commence en pose, avec neuf cases offertes', () => {
    const state = createMorpion();
    assert.equal(state.phase, 'placement');
    assert.equal(availableMoves(state).length, 9);
    assert.equal(state.current, 'X');
  });

  test('poser un pion passe la main', () => {
    const next = playMorpion(createMorpion(), place(4));
    assert.equal(next.grid[4], 'X');
    assert.equal(next.current, 'O');
    assert.equal(next.placed.X, 1);
  });

  test('une case occupée est refusée', () => {
    const first = playMorpion(createMorpion(), place(0));
    assert.equal(playMorpion(first, place(0)), first);
  });

  test('aligner pendant la pose gagne aussitôt', () => {
    let state = createMorpion('X');
    for (const cell of [0, 3, 1, 4, 2]) {
      state = playMorpion(state, place(cell));
    }
    assert.equal(state.status.kind, 'win');
    if (state.status.kind === 'win') assert.equal(state.status.winner, 'X');
  });

  test('la phase bascule une fois les six pions posés', () => {
    let state = createMorpion('X');
    // Pose sans alignement.
    for (const cell of [0, 1, 3, 2, 7, 5]) {
      state = playMorpion(state, place(cell));
      assert.notEqual(state.status.kind, 'win', `alignement imprévu sur ${cell}`);
    }

    assert.equal(state.placed.X, PIECES_PER_PLAYER);
    assert.equal(state.placed.O, PIECES_PER_PLAYER);
    assert.equal(state.phase, 'movement', 'la partie doit continuer, pas s’arrêter');
    assert.equal(state.status.kind, 'playing');
  });

  test('la grille reçue n’est jamais modifiée', () => {
    const state = createMorpion();
    playMorpion(state, place(3));
    assert.equal(state.grid[3], null);
  });
});

describe('phase de déplacement', () => {
  test('un pion va sur n’importe quelle case libre', () => {
    const state = movementState('XOX O.. .OX', 'X');
    const moves = availableMoves(state);

    assert.ok(moves.every((m) => m.type === 'move'));
    // Les trois cases vides — 4, 5 et 6 — sont toutes ouvertes au pion de 0.
    const fromZero = moves
      .filter((m) => m.type === 'move' && m.from === 0)
      .map((m) => m.to)
      .sort((a, b) => a - b);
    assert.deepEqual(fromZero, [4, 5, 6]);
  });

  test('trois pions et trois cases libres font toujours neuf coups', () => {
    const state = movementState('XOX O.. .OX', 'X');
    assert.equal(availableMoves(state).length, 9);
  });

  test('une case éloignée est atteignable', () => {
    const state = movementState('X.X XO. OO.', 'X');
    // 0 et 8 sont aux deux bouts du plateau : le déplacement reste permis.
    const next = playMorpion(state, move(0, 8));
    assert.notEqual(next, state);
    assert.equal(next.grid[8], 'X');
    assert.equal(next.grid[0], null);
  });

  test('on ne déplace pas un pion adverse', () => {
    const state = movementState('X.. .O. ..X', 'X');
    assert.equal(playMorpion(state, move(4, 3)), state);
  });

  test('aligner par déplacement gagne', () => {
    // X tient 0 et 1 ; le troisième pion, en 5, vient compléter en 2.
    const state = movementState('XX. O.X OO.', 'X');
    const won = playMorpion(state, move(5, 2));

    assert.equal(won.status.kind, 'win');
    if (won.status.kind === 'win') {
      assert.equal(won.status.winner, 'X');
      assert.deepEqual(won.status.line, [0, 1, 2]);
    }
  });

  test('déplacer un pion hors de sa propre ligne ne gagne pas', () => {
    // Compléter la rangée avec le pion de la case 1 la viderait au passage.
    const state = movementState('XX. O.X OO.', 'X');
    const next = playMorpion(state, move(1, 2));

    assert.equal(next.status.kind, 'playing');
  });

  test('un joueur a toujours un coup à jouer', () => {
    // Avec le déplacement libre, trois cases restent vides en permanence :
    // aucun camp ne peut se retrouver enfermé.
    const state = movementState('XOX .O. X.O', 'X');
    assert.equal(availableMoves(state).length, 9);
  });
});

describe('fin de partie', () => {
  test('la ligne gagnante est rapportée', () => {
    const grid = gridFrom('XXX OO. ...');
    const won = findWinningLine(grid);
    assert.ok(won);
    assert.equal(won!.mark, 'X');
    assert.deepEqual(won!.line, [0, 1, 2]);
  });

  test('la répétition de position rend la partie nulle', () => {
    // Deux pions font l'aller-retour entre les mêmes cases, sans jamais aligner.
    let state = movementState('X.O XO. .XO', 'X');
    const cycle: readonly MorpionMove[] = [
      move(0, 1),
      move(2, 5),
      move(1, 0),
      move(5, 2),
    ];

    let drawn = false;
    for (let i = 0; i < 24 && state.status.kind === 'playing'; i++) {
      const next = playMorpion(state, cycle[i % cycle.length]);
      if (next === state) break;
      state = next;
      if (state.status.kind === 'draw' && state.status.reason === 'repetition') {
        drawn = true;
        break;
      }
    }

    assert.ok(drawn, 'la troisième répétition doit arrêter la partie');
  });

  test('cinquante déplacements sans alignement suffisent aussi', () => {
    assert.equal(NO_WIN_LIMIT, 50);
  });

  test('plus aucun coup une fois la partie finie', () => {
    let state = createMorpion('X');
    for (const cell of [0, 3, 1, 4, 2]) state = playMorpion(state, place(cell));

    assert.equal(state.status.kind, 'win');
    assert.equal(availableMoves(state).length, 0);
    assert.equal(playMorpion(state, place(5)), state);
  });
});

describe('adversaire', () => {
  test('tous les niveaux saisissent l’alignement offert', () => {
    // Le pion de la case 5 complète la rangée du haut : victoire immédiate.
    const state = movementState('XX. O.X OO.', 'X');
    for (const { id } of MORPION_OPPONENTS) {
      const chosen = findBestMorpionMove(state, id, seeded(5));
      assert.ok(chosen);
      assert.equal(
        playMorpion(state, chosen!).status.kind,
        'win',
        `${id} laisse passer la victoire`,
      );
    }
  });

  test('le coup proposé est toujours légal', () => {
    for (const { id } of MORPION_OPPONENTS) {
      let state = createMorpion('X');
      for (let i = 0; i < 12 && state.status.kind === 'playing'; i++) {
        const chosen = findBestMorpionMove(state, id, seeded(i + 1));
        assert.ok(chosen, `${id} doit proposer un coup`);
        const next = playMorpion(state, chosen!);
        assert.notEqual(next, state, `${id} propose un coup refusé`);
        state = next;
      }
    }
  });

  test('la hiérarchie des niveaux se vérifie en partie', () => {
    let mediumWins = 0;
    const rounds = 12;

    for (let seed = 1; seed <= rounds; seed++) {
      const final = playOut('medium', 'easy', seed);
      if (final.status.kind === 'win' && final.status.winner === 'X') mediumWins++;
    }

    assert.ok(
      mediumWins >= rounds * 0.6,
      `la cousine ne bat le petit que ${mediumWins} fois sur ${rounds}`,
    );
  });

  test('le niveau fort ne perd pas contre le niveau moyen', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const final = playOut('medium', 'hard', seed);
      assert.ok(
        !(final.status.kind === 'win' && final.status.winner === 'X'),
        `le niveau fort a perdu (graine ${seed})`,
      );
    }
  });

  test('les parties se terminent, et rarement par un nul', () => {
    let draws = 0;
    const rounds = 12;

    for (let seed = 1; seed <= rounds; seed++) {
      const final = playOut('medium', 'medium', seed);
      assert.notEqual(final.status.kind, 'playing', 'la partie doit se conclure');
      if (final.status.kind === 'draw') draws++;
    }

    // C'était tout l'intérêt de la phase de déplacement : sortir des positions
    // mortes du morpion à pose, où le nul était la norme.
    assert.ok(draws <= rounds / 2, `${draws} nuls sur ${rounds} parties`);
  });

  test('la recherche ne modifie pas la position confiée', () => {
    const state = createMorpion();
    const before = serializeGrid(state.grid);
    bestMove(state, 4);
    assert.equal(serializeGrid(state.grid), before);
  });
});

describe('confort', () => {
  test('les camps alternent correctement', () => {
    assert.equal(other('X'), 'O');
    assert.equal(other('O'), 'X');
  });

  test('la réflexion n’est ni instantanée ni interminable', () => {
    assert.ok(morpionThinkingDelay(() => 0) >= 320);
    assert.ok(morpionThinkingDelay(() => 0.999) < 800);
  });
});
