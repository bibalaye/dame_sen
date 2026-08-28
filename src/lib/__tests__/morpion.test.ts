import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  MORPION_OPPONENTS,
  availableMoves,
  createMorpion,
  findBestMorpionMove,
  findWinningLine,
  morpionThinkingDelay,
  other,
  perfectMove,
  playMorpion,
  type Grid,
  type Mark,
  type MorpionDifficulty,
  type MorpionState,
} from '../morpion.ts';

/** Grille depuis un croquis : `.` vide, `X` et `O` les deux camps. */
const gridFrom = (rows: string): Grid =>
  [...rows.replace(/\s/g, '')].map((c) => (c === '.' ? null : (c as Mark)));

const stateFrom = (rows: string, current: Mark): MorpionState => {
  const grid = gridFrom(rows);
  const won = findWinningLine(grid);
  return {
    grid,
    current,
    status: won
      ? { kind: 'win', winner: won.mark, line: won.line }
      : grid.every((c) => c !== null)
        ? { kind: 'draw' }
        : { kind: 'playing' },
    lastMove: null,
  };
};

const seeded = (seed: number): (() => number) => {
  let v = seed >>> 0;
  return () => {
    v = (v * 1664525 + 1013904223) >>> 0;
    return v / 0x100000000;
  };
};

describe('règles', () => {
  test('la grille commence vide et X ouvre', () => {
    const state = createMorpion();
    assert.equal(state.grid.filter(Boolean).length, 0);
    assert.equal(state.current, 'X');
    assert.equal(availableMoves(state).length, 9);
  });

  test('jouer une case pose la marque et passe la main', () => {
    const next = playMorpion(createMorpion(), 4);
    assert.equal(next.grid[4], 'X');
    assert.equal(next.current, 'O');
    assert.equal(next.lastMove, 4);
  });

  test('une case occupée est refusée', () => {
    const first = playMorpion(createMorpion(), 0);
    assert.equal(playMorpion(first, 0), first);
  });

  test('un index hors grille est refusé', () => {
    const state = createMorpion();
    assert.equal(playMorpion(state, 9), state);
    assert.equal(playMorpion(state, -1), state);
  });

  test('la grille reçue n’est jamais modifiée', () => {
    const state = createMorpion();
    playMorpion(state, 3);
    assert.equal(state.grid[3], null);
  });
});

describe('fin de partie', () => {
  test('une ligne gagne', () => {
    const state = stateFrom('XX. OO. ...', 'X');
    const next = playMorpion(state, 2);
    assert.equal(next.status.kind, 'win');
    if (next.status.kind === 'win') {
      assert.equal(next.status.winner, 'X');
      assert.deepEqual(next.status.line, [0, 1, 2]);
    }
  });

  test('une colonne gagne', () => {
    const next = playMorpion(stateFrom('X.. X.. .OO', 'X'), 6);
    assert.equal(next.status.kind, 'win');
  });

  test('une diagonale gagne', () => {
    const next = playMorpion(stateFrom('X.. .X. OO.', 'X'), 8);
    assert.equal(next.status.kind, 'win');
    if (next.status.kind === 'win') {
      assert.deepEqual(next.status.line, [0, 4, 8]);
    }
  });

  test('une grille pleine sans ligne est nulle', () => {
    const next = playMorpion(stateFrom('XOX XXO OX.', 'O'), 8);
    assert.equal(next.status.kind, 'draw');
  });

  test('plus aucun coup une fois la partie finie', () => {
    const won = playMorpion(stateFrom('XX. OO. ...', 'X'), 2);
    assert.equal(availableMoves(won).length, 0);
    assert.equal(playMorpion(won, 5), won);
  });
});

describe('adversaire parfait', () => {
  test('il prend la victoire immédiate', () => {
    assert.equal(perfectMove(stateFrom('XX. OO. ...', 'X')), 2);
  });

  test('il bloque la victoire adverse', () => {
    // O doit couvrir la case 2, sans quoi X aligne la rangée du haut.
    assert.equal(perfectMove(stateFrom('XX. O.. ...', 'O')), 2);
  });

  test('il préfère gagner plutôt que bloquer', () => {
    // X peut aligner en 2 ; O menace en 6. Gagner passe avant.
    assert.equal(perfectMove(stateFrom('XX. ... OO.', 'X')), 2);
  });

  test('il est imbattable, quelle que soit l’ouverture adverse', () => {
    // L'humain (X) joue toutes les premières cases possibles, puis au mieux.
    for (let opening = 0; opening < 9; opening++) {
      let state = playMorpion(createMorpion('X'), opening);

      while (state.status.kind === 'playing') {
        const move = perfectMove(state);
        assert.ok(move !== null);
        state = playMorpion(state, move!);
      }

      assert.notEqual(
        state.status.kind === 'win' && state.status.winner === 'X',
        true,
        `l'ouverture ${opening} bat l'adversaire parfait`,
      );
    }
  });

  test('deux joueurs parfaits font toujours nulle', () => {
    let state = createMorpion();
    while (state.status.kind === 'playing') {
      state = playMorpion(state, perfectMove(state)!);
    }
    assert.equal(state.status.kind, 'draw');
  });
});

describe('niveaux', () => {
  test('chaque niveau propose un coup jouable', () => {
    for (const { id } of MORPION_OPPONENTS) {
      const state = createMorpion();
      const move = findBestMorpionMove(state, id, seeded(3));
      assert.ok(move !== null);
      assert.notEqual(playMorpion(state, move!), state);
    }
  });

  test('tous les niveaux saisissent la victoire immédiate', () => {
    for (const { id } of MORPION_OPPONENTS) {
      const move = findBestMorpionMove(stateFrom('XX. OO. ...', 'O'), id, seeded(9));
      assert.equal(move, 5, `${id} laisse passer la victoire`);
    }
  });

  test('le niveau fort ne perd jamais contre le niveau faible', () => {
    for (let seed = 0; seed < 25; seed++) {
      const random = seeded(seed + 1);
      let state = createMorpion('X');
      // X est le niveau faible, O le niveau fort.
      while (state.status.kind === 'playing') {
        const level: MorpionDifficulty = state.current === 'X' ? 'easy' : 'hard';
        state = playMorpion(state, findBestMorpionMove(state, level, random)!);
      }
      assert.ok(
        !(state.status.kind === 'win' && state.status.winner === 'X'),
        `le niveau faible a gagné (graine ${seed})`,
      );
    }
  });

  test('le niveau faible, lui, se laisse battre', () => {
    let losses = 0;
    for (let seed = 0; seed < 25; seed++) {
      const random = seeded(seed + 100);
      let state = createMorpion('X');
      while (state.status.kind === 'playing') {
        const level: MorpionDifficulty = state.current === 'X' ? 'hard' : 'easy';
        state = playMorpion(state, findBestMorpionMove(state, level, random)!);
      }
      if (state.status.kind === 'win' && state.status.winner === 'X') losses++;
    }
    assert.ok(losses > 0, 'le niveau faible ne perd jamais : il est trop fort');
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
