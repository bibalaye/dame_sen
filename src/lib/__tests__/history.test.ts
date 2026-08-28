import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  HISTORY_LIMIT,
  addEntry,
  computeStats,
  filterByGame,
  formatWhen,
  makeEntryId,
  type GameResult,
  type HistoryEntry,
} from '../history.ts';

let clock = 1_700_000_000_000;

/** Les entrées sont rangées de la plus récente à la plus ancienne. */
const entry = (
  result: GameResult,
  game: 'dames' | 'morpion' = 'dames',
  opponent = 'Le tonton',
): HistoryEntry => ({
  id: makeEntryId((clock -= 60_000)),
  game,
  mode: 'solo',
  result,
  opponent,
  playedAt: clock,
});

/** Construit une liste depuis la plus récente : « WWL » = deux victoires puis une défaite. */
const from = (pattern: string): HistoryEntry[] =>
  [...pattern].map((c) =>
    entry(c === 'W' ? 'win' : c === 'L' ? 'loss' : 'draw'),
  );

describe('statistiques', () => {
  test('un historique vide ne compte rien', () => {
    const stats = computeStats([]);
    assert.equal(stats.played, 0);
    assert.equal(stats.winRate, 0);
    assert.equal(stats.currentStreak, 0);
    assert.equal(stats.bestStreak, 0);
  });

  test('les résultats sont comptés par type', () => {
    const stats = computeStats(from('WWLDW'));
    assert.equal(stats.played, 5);
    assert.equal(stats.wins, 3);
    assert.equal(stats.losses, 1);
    assert.equal(stats.draws, 1);
  });

  test('le taux de victoire est une part du total', () => {
    assert.equal(computeStats(from('WL')).winRate, 0.5);
    assert.equal(computeStats(from('WWWW')).winRate, 1);
    assert.equal(computeStats(from('LLL')).winRate, 0);
  });

  test('la série en cours part de la partie la plus récente', () => {
    assert.equal(computeStats(from('WWWL')).currentStreak, 3);
    assert.equal(computeStats(from('LWWW')).currentStreak, 0, 'une défaite la coupe');
    assert.equal(computeStats(from('DWW')).currentStreak, 0, 'une nulle aussi');
  });

  test('la meilleure série survit aux défaites qui suivent', () => {
    const stats = computeStats(from('LWWWWL'));
    assert.equal(stats.currentStreak, 0);
    assert.equal(stats.bestStreak, 4);
  });

  test('la meilleure série vaut au moins la série en cours', () => {
    const stats = computeStats(from('WWWWW'));
    assert.equal(stats.currentStreak, 5);
    assert.equal(stats.bestStreak, 5);
  });
});

describe('ajout de parties', () => {
  test('la dernière partie passe en tête', () => {
    const before = from('WL');
    const latest = entry('draw');
    const after = addEntry(before, latest);

    assert.equal(after[0], latest);
    assert.equal(after.length, 3);
  });

  test('l’historique ne dépasse pas sa limite', () => {
    let entries: HistoryEntry[] = [];
    for (let i = 0; i < HISTORY_LIMIT + 40; i++) {
      entries = addEntry(entries, entry('win'));
    }
    assert.equal(entries.length, HISTORY_LIMIT);
  });

  test('ce sont les plus anciennes qui sont oubliées', () => {
    let entries: HistoryEntry[] = [];
    for (let i = 0; i < HISTORY_LIMIT; i++) entries = addEntry(entries, entry('loss'));

    const latest = entry('win');
    entries = addEntry(entries, latest);

    assert.equal(entries[0], latest);
    assert.equal(entries.length, HISTORY_LIMIT);
  });

  test('la liste reçue n’est pas modifiée', () => {
    const before = from('WW');
    const size = before.length;
    addEntry(before, entry('loss'));
    assert.equal(before.length, size);
  });
});

describe('filtrage par jeu', () => {
  test('chaque plateau a ses propres statistiques', () => {
    const entries = [
      entry('win', 'dames'),
      entry('loss', 'morpion'),
      entry('win', 'morpion'),
      entry('win', 'dames'),
    ];

    assert.equal(filterByGame(entries, 'dames').length, 2);
    assert.equal(computeStats(filterByGame(entries, 'dames')).winRate, 1);
    assert.equal(computeStats(filterByGame(entries, 'morpion')).winRate, 0.5);
  });
});

describe('affichage des dates', () => {
  const now = 1_700_000_000_000;

  test('les minutes et les heures sont dites en clair', () => {
    assert.equal(formatWhen(now - 30_000, now), 'à l’instant');
    assert.equal(formatWhen(now - 5 * 60_000, now), 'il y a 5 min');
    assert.equal(formatWhen(now - 3 * 3_600_000, now), 'il y a 3 h');
  });

  test('la veille se dit « hier »', () => {
    assert.equal(formatWhen(now - 26 * 3_600_000, now), 'hier');
    assert.equal(formatWhen(now - 3 * 24 * 3_600_000, now), 'il y a 3 jours');
  });

  test('au-delà d’une semaine, la date est donnée', () => {
    const label = formatWhen(now - 30 * 24 * 3_600_000, now);
    assert.ok(!label.includes('il y a'), `date attendue, reçu « ${label} »`);
  });
});

describe('identifiants', () => {
  test('deux parties distinctes ne partagent pas le même identifiant', () => {
    assert.notEqual(makeEntryId(1, 'a'), makeEntryId(1, 'b'));
    assert.notEqual(makeEntryId(1), makeEntryId(2));
  });
});
