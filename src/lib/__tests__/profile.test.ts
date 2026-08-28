import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  EMPTY_DAILY,
  EMPTY_LOADOUT,
  EMPTY_PROFILE,
  IMPORT_COIN_CAP,
  hasLocalProgress,
  mergeDaily,
  mergeHistory,
  mergeProfiles,
  mergeWallet,
  summarizeImport,
  type PlayerProfile,
} from '../profile.ts';
import { EMPTY_WALLET, type Wallet } from '../economy.ts';
import { HISTORY_LIMIT, type HistoryEntry } from '../history.ts';
import { itemId } from '../shop.ts';

const partie = (id: string, playedAt: number): HistoryEntry => ({
  id,
  game: 'dames',
  mode: 'solo',
  result: 'win',
  opponent: 'Ordinateur',
  playedAt,
});

const walletWith = (values: Partial<Wallet>): Wallet => ({ ...EMPTY_WALLET, ...values });

const profileWith = (values: Partial<PlayerProfile>): PlayerProfile => ({
  ...EMPTY_PROFILE,
  ...values,
});

describe('fusion des historiques', () => {
  test('les parties des deux côtés survivent', () => {
    const merged = mergeHistory([partie('a', 200)], [partie('b', 100)]);
    assert.equal(merged.length, 2);
    assert.deepEqual(
      merged.map((entry) => entry.id),
      ['a', 'b'],
    );
  });

  test('la même partie n’est pas comptée deux fois', () => {
    const merged = mergeHistory([partie('a', 100)], [partie('a', 100)]);
    assert.equal(merged.length, 1);
  });

  test('le résultat va de la plus récente à la plus ancienne', () => {
    const merged = mergeHistory(
      [partie('vieux', 100), partie('recent', 900)],
      [partie('milieu', 500)],
    );
    assert.deepEqual(
      merged.map((entry) => entry.id),
      ['recent', 'milieu', 'vieux'],
    );
  });

  test('la première source l’emporte à identifiant égal', () => {
    const distant: HistoryEntry = { ...partie('x', 100), opponent: 'Distant' };
    const local: HistoryEntry = { ...partie('x', 100), opponent: 'Local' };

    assert.equal(mergeHistory([distant], [local])[0].opponent, 'Distant');
  });

  test('la limite de conservation est respectée', () => {
    const beaucoup = Array.from({ length: HISTORY_LIMIT }, (_, i) =>
      partie('a' + i, 1000 + i),
    );
    const autres = Array.from({ length: 50 }, (_, i) => partie('b' + i, i));

    assert.equal(mergeHistory(beaucoup, autres).length, HISTORY_LIMIT);
  });

  test('au-delà de la limite, ce sont les plus anciennes qui partent', () => {
    const anciennes = Array.from({ length: HISTORY_LIMIT }, (_, i) =>
      partie('vieux' + i, i),
    );
    const nouvelle = partie('neuve', 10_000_000);

    const merged = mergeHistory(anciennes, [nouvelle]);
    assert.equal(merged[0].id, 'neuve', 'la plus récente est gardée');
    assert.equal(merged.length, HISTORY_LIMIT);
  });

  test('fusionner avec rien ne perd rien', () => {
    const entrees = [partie('a', 100), partie('b', 200)];
    assert.equal(mergeHistory(entrees, []).length, 2);
    assert.equal(mergeHistory([], entrees).length, 2);
  });
});

describe('fusion des séries du défi', () => {
  test('la progression la plus avancée est retenue', () => {
    const vieille = { lastNumber: 10, streak: 5, solvedCount: 8 };
    const recente = { lastNumber: 40, streak: 2, solvedCount: 20 };

    const merged = mergeDaily(vieille, recente);
    assert.equal(merged.lastNumber, 40);
    assert.equal(merged.streak, 2, 'une vieille série ne ressuscite pas');
  });

  test('l’ordre des arguments ne change pas le résultat', () => {
    const a = { lastNumber: 10, streak: 5, solvedCount: 8 };
    const b = { lastNumber: 40, streak: 2, solvedCount: 20 };

    assert.deepEqual(mergeDaily(a, b), mergeDaily(b, a));
  });

  test('le nombre de défis résolus ne baisse pas', () => {
    const merged = mergeDaily(
      { lastNumber: 50, streak: 1, solvedCount: 3 },
      { lastNumber: 10, streak: 1, solvedCount: 30 },
    );
    assert.equal(merged.solvedCount, 30);
  });

  test('fusionner avec une progression vierge ne fait rien perdre', () => {
    const progres = { lastNumber: 12, streak: 4, solvedCount: 9 };
    assert.deepEqual(mergeDaily(progres, EMPTY_DAILY), progres);
  });
});

describe('fusion des portefeuilles', () => {
  test('le solde du compte fait foi', () => {
    const local = walletWith({ coins: 999_999, earned: 999_999 });
    const distant = walletWith({ coins: 120, earned: 300 });

    const merged = mergeWallet(local, distant);
    assert.equal(merged.coins, 120, 'un solde local gonflé n’est pas repris');
    assert.equal(merged.earned, 300);
  });

  test('les déblocages des deux côtés se cumulent', () => {
    const local = walletWith({ owned: [itemId('pieces', 'cauri'), itemId('pieces', 'sabar')] });
    const distant = walletWith({ owned: [itemId('pieces', 'cauri'), itemId('pieces', 'baobab')] });

    const merged = mergeWallet(local, distant);
    assert.deepEqual([...merged.owned].sort(), ['pieces:baobab', 'pieces:cauri', 'pieces:sabar']);
  });

  test('un déblocage n’apparaît jamais en double', () => {
    const merged = mergeWallet(
      walletWith({ owned: [itemId('pieces', 'cauri'), itemId('pieces', 'sabar')] }),
      walletWith({ owned: [itemId('pieces', 'sabar'), itemId('pieces', 'cauri')] }),
    );
    assert.equal(merged.owned.length, 2);
  });

  test('la venue la plus récente est retenue avec sa série', () => {
    const local = walletWith({ lastVisitDay: 100, visitStreak: 3 });
    const distant = walletWith({ lastVisitDay: 105, visitStreak: 1 });

    const merged = mergeWallet(local, distant);
    assert.equal(merged.lastVisitDay, 105);
    assert.equal(merged.visitStreak, 1, 'la série suit le jour le plus récent');
  });

  test('une venue locale plus récente garde sa série', () => {
    const merged = mergeWallet(
      walletWith({ lastVisitDay: 110, visitStreak: 6 }),
      walletWith({ lastVisitDay: 105, visitStreak: 1 }),
    );
    assert.equal(merged.lastVisitDay, 110);
    assert.equal(merged.visitStreak, 6);
  });
});

describe('fusion complète', () => {
  test('un compte neuf garde les pions choisis sur l’appareil', () => {
    const local = profileWith({ loadout: { ...EMPTY_LOADOUT, pieces: 'baobab' } });
    const distant = profileWith({ loadout: EMPTY_LOADOUT });

    assert.equal(mergeProfiles(local, distant).loadout.pieces, 'baobab');
  });

  test('un compte qui a choisi impose ses pions', () => {
    const local = profileWith({ loadout: { ...EMPTY_LOADOUT, pieces: 'baobab' } });
    const distant = profileWith({ loadout: { ...EMPTY_LOADOUT, pieces: 'donjon' } });

    assert.equal(mergeProfiles(local, distant).loadout.pieces, 'donjon');
  });

  test('les parties hors ligne rejoignent celles du compte', () => {
    const local = profileWith({ history: [partie('local', 500)] });
    const distant = profileWith({ history: [partie('distant', 400)] });

    const merged = mergeProfiles(local, distant);
    assert.equal(merged.history.length, 2);
  });

  test('rien n’est perdu en fusionnant deux profils vierges', () => {
    const merged = mergeProfiles(EMPTY_PROFILE, EMPTY_PROFILE);
    assert.deepEqual(merged.history, []);
    assert.equal(merged.wallet.coins, 0);
  });

  test('les profils reçus ne sont pas modifiés', () => {
    const local = profileWith({
      history: [partie('a', 100)],
      wallet: walletWith({ coins: 50, owned: [itemId('pieces', 'cauri'), itemId('pieces', 'sabar')] }),
    });
    const avant = JSON.stringify(local);

    mergeProfiles(local, EMPTY_PROFILE);
    assert.equal(JSON.stringify(local), avant);
  });
});

describe('reprise d’une progression hors compte', () => {
  test('un solde honnête est repris tel quel', () => {
    const local = profileWith({ wallet: walletWith({ coins: 250 }) });
    const resume = summarizeImport(local);

    assert.equal(resume.coins, 250);
    assert.ok(!resume.capped);
  });

  test('un solde gonflé est plafonné', () => {
    const local = profileWith({ wallet: walletWith({ coins: 5_000_000 }) });
    const resume = summarizeImport(local);

    assert.equal(resume.coins, IMPORT_COIN_CAP);
    assert.ok(resume.capped, 'le joueur doit savoir que le solde a été rogné');
  });

  test('le plafond exact n’est pas signalé comme rogné', () => {
    const local = profileWith({ wallet: walletWith({ coins: IMPORT_COIN_CAP }) });
    assert.ok(!summarizeImport(local).capped);
  });

  test('les parties comptées ne dépassent pas la limite', () => {
    const local = profileWith({
      history: Array.from({ length: HISTORY_LIMIT }, (_, i) => partie('a' + i, i)),
    });
    assert.equal(summarizeImport(local).games, HISTORY_LIMIT);
  });
});

describe('détection d’une progression à reprendre', () => {
  test('un appareil vierge n’a rien à proposer', () => {
    assert.ok(!hasLocalProgress(EMPTY_PROFILE));
  });

  test('une partie jouée suffit', () => {
    assert.ok(hasLocalProgress(profileWith({ history: [partie('a', 100)] })));
  });

  test('des étoiles gagnées suffisent', () => {
    assert.ok(hasLocalProgress(profileWith({ wallet: walletWith({ earned: 10 }) })));
  });

  test('un jeu de pions débloqué suffit', () => {
    assert.ok(
      hasLocalProgress(
        profileWith({ wallet: walletWith({ owned: [itemId('pieces', 'cauri'), itemId('pieces', 'sabar')] }) }),
      ),
    );
  });

  test('le jeu de pions offert ne compte pas pour une progression', () => {
    assert.ok(
      !hasLocalProgress(profileWith({ wallet: walletWith({ owned: [itemId('pieces', 'cauri')] }) })),
    );
  });
});
