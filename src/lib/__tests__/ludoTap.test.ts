import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { resolvePawnTap } from '../ludoTap.ts';
import type { LudoMove } from '../ludo.ts';

/** Un coup, réduit à ce dont la décision a besoin. */
const coup = (pawn: number, die: number, square: number): LudoMove => ({
  kind: 'advance',
  pawn,
  die,
  to: { zone: 'track', square },
});

describe('appui sur un pion', () => {
  test('un pion sans coup ne répond pas', () => {
    assert.deepEqual(resolvePawnTap([coup(0, 3, 13)], null, 1), { kind: 'ignore' });
  });

  test('un pion qui n’a qu’un coup se joue au doigt', () => {
    const moves = [coup(0, 3, 13)];
    assert.deepEqual(resolvePawnTap(moves, null, 0), { kind: 'play', move: moves[0] });
  });

  test('un pion à plusieurs destinations demande où aller', () => {
    const moves = [coup(0, 1, 11), coup(0, 3, 13)];
    assert.deepEqual(resolvePawnTap(moves, null, 0), { kind: 'select', pawn: 0 });
  });

  test('le pion déjà choisi se joue quand il ne lui reste qu’un coup', () => {
    /*
     * C'est le cas qui a échoué en jeu. Après une prise avec le trois, le pion
     * reste choisi et le un attend ; retoucher le pion le relâchait, et l'on
     * croyait devoir en jouer un autre.
     */
    const moves = [coup(0, 1, 14)];
    assert.deepEqual(resolvePawnTap(moves, 0, 0), { kind: 'play', move: moves[0] });
  });

  test('le pion déjà choisi se relâche s’il a encore le choix', () => {
    const moves = [coup(0, 1, 11), coup(0, 3, 13)];
    assert.deepEqual(resolvePawnTap(moves, 0, 0), { kind: 'release' });
  });

  test('toucher un autre pion le choisit sans relâcher le premier', () => {
    const moves = [coup(0, 1, 11), coup(0, 3, 13), coup(2, 1, 20), coup(2, 3, 22)];

    assert.deepEqual(
      resolvePawnTap(moves, 0, 2),
      { kind: 'select', pawn: 2 },
      'changer d’avis ne doit pas coûter deux gestes',
    );
  });

  test('toucher un autre pion qui n’a qu’un coup le joue directement', () => {
    const moves = [coup(0, 1, 11), coup(0, 3, 13), coup(2, 3, 22)];

    assert.deepEqual(resolvePawnTap(moves, 0, 2), { kind: 'play', move: moves[2] });
  });

  test('aucun coup du tout : rien ne se passe', () => {
    assert.deepEqual(resolvePawnTap([], 0, 0), { kind: 'ignore' });
  });
});
