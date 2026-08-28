import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  EMPTY_WALLET,
  PIECE_SET_PRICES,
  REWARDS,
  canAfford,
  credit,
  gameRewards,
  isUnlocked,
  nextGoal,
  priceOf,
  registerVisit,
  totalOf,
  unlock,
  type Wallet,
} from '../economy.ts';
import { PIECE_SETS } from '../pieceSets.ts';

const walletWith = (values: Partial<Wallet>): Wallet => ({ ...EMPTY_WALLET, ...values });

describe('gains', () => {
  test('créditer augmente le solde et le total gagné', () => {
    const after = credit(EMPTY_WALLET, 'win');
    assert.equal(after.stars, REWARDS.win);
    assert.equal(after.earned, REWARDS.win);
  });

  test('une partie perdue rapporte quand même la participation', () => {
    const rewards = gameRewards(false, 0);
    assert.deepEqual(rewards, ['played']);
    assert.equal(totalOf(rewards), REWARDS.played);
  });

  test('une victoire ajoute sa prime', () => {
    const rewards = gameRewards(true, 1);
    assert.ok(rewards.includes('played'));
    assert.ok(rewards.includes('win'));
    assert.ok(!rewards.includes('streak'), 'la série n’est pas encore atteinte');
  });

  test('la troisième victoire d’affilée déclenche le palier', () => {
    const rewards = gameRewards(true, 3);
    assert.ok(rewards.includes('streak'));
    assert.equal(totalOf(rewards), REWARDS.played + REWARDS.win + REWARDS.streak);
  });

  test('le palier revient tous les trois, pas à chaque victoire', () => {
    assert.ok(!gameRewards(true, 4).includes('streak'));
    assert.ok(!gameRewards(true, 5).includes('streak'));
    assert.ok(gameRewards(true, 6).includes('streak'));
  });

  test('une défaite ne déclenche jamais le palier', () => {
    assert.ok(!gameRewards(false, 3).includes('streak'));
  });
});

describe('venue quotidienne', () => {
  test('la première venue est récompensée', () => {
    const { wallet, rewards } = registerVisit(EMPTY_WALLET, 100);
    assert.deepEqual(rewards, ['daily-login']);
    assert.equal(wallet.stars, REWARDS['daily-login']);
    assert.equal(wallet.visitStreak, 1);
  });

  test('revenir le même jour ne rapporte rien', () => {
    const { wallet } = registerVisit(EMPTY_WALLET, 100);
    const second = registerVisit(wallet, 100);

    assert.deepEqual(second.rewards, []);
    assert.equal(second.wallet.stars, wallet.stars, 'le solde ne bouge pas');
  });

  test('la série suit les jours consécutifs', () => {
    let wallet = EMPTY_WALLET;
    for (let day = 1; day <= 3; day++) wallet = registerVisit(wallet, day).wallet;
    assert.equal(wallet.visitStreak, 3);
  });

  test('un jour manqué remet la série à un', () => {
    let wallet = registerVisit(EMPTY_WALLET, 1).wallet;
    wallet = registerVisit(wallet, 2).wallet;
    wallet = registerVisit(wallet, 5).wallet;

    assert.equal(wallet.visitStreak, 1, 'la série est cassée');
  });

  test('le septième jour d’affilée verse la prime', () => {
    let wallet = EMPTY_WALLET;
    let seventh: readonly string[] = [];

    for (let day = 1; day <= 7; day++) {
      const outcome = registerVisit(wallet, day);
      wallet = outcome.wallet;
      if (day === 7) seventh = outcome.rewards;
    }

    assert.ok(seventh.includes('daily-login-week'));
    assert.equal(wallet.visitStreak, 7);
  });

  test('sept visites étalées ne donnent pas la prime', () => {
    let wallet = EMPTY_WALLET;
    // Une visite tous les deux jours : la série casse à chaque fois.
    for (let day = 1; day <= 14; day += 2) wallet = registerVisit(wallet, day).wallet;

    assert.equal(wallet.visitStreak, 1);
    assert.equal(wallet.stars, REWARDS['daily-login'] * 7, 'aucune prime hebdomadaire');
  });
});

describe('déblocages', () => {
  test('le premier jeu de pions est offert', () => {
    assert.equal(priceOf('cauri'), 0);
    assert.ok(isUnlocked(EMPTY_WALLET, 'cauri'));
  });

  test('les autres sont verrouillés au départ', () => {
    for (const set of PIECE_SETS) {
      if (priceOf(set.id) === 0) continue;
      assert.ok(!isUnlocked(EMPTY_WALLET, set.id), `${set.id} devrait être verrouillé`);
    }
  });

  test('débloquer débite le solde', () => {
    const rich = walletWith({ stars: 1000 });
    const after = unlock(rich, 'sabar');

    assert.ok(isUnlocked(after, 'sabar'));
    assert.equal(after.stars, 1000 - priceOf('sabar'));
  });

  test('un solde insuffisant ne débloque rien', () => {
    const poor = walletWith({ stars: 10 });
    assert.equal(unlock(poor, 'jetons'), poor, 'rien ne change');
    assert.ok(!canAfford(poor, 'jetons'));
  });

  test('on ne paie jamais deux fois le même jeu', () => {
    const rich = walletWith({ stars: 2000 });
    const once = unlock(rich, 'sabar');
    const twice = unlock(once, 'sabar');

    assert.equal(twice.stars, once.stars, 'le second achat ne débite pas');
    assert.equal(twice.unlocked.length, once.unlocked.length);
  });

  test('le total gagné survit aux achats', () => {
    let wallet = EMPTY_WALLET;
    for (let i = 0; i < 20; i++) wallet = credit(wallet, 'win');
    const gagne = wallet.earned;

    wallet = unlock(wallet, 'sabar');
    assert.equal(wallet.earned, gagne, 'dépenser n’efface pas ce qu’on a gagné');
    assert.ok(wallet.stars < gagne);
  });

  test('chaque jeu de pions a un prix déclaré', () => {
    for (const set of PIECE_SETS) {
      assert.equal(
        typeof PIECE_SET_PRICES[set.id],
        'number',
        `prix manquant pour ${set.id}`,
      );
    }
  });
});

describe('prochain objectif', () => {
  test('c’est le moins cher des jeux verrouillés', () => {
    const goal = nextGoal(EMPTY_WALLET);
    assert.ok(goal);
    assert.equal(goal!.id, 'sabar');
    assert.equal(goal!.missing, priceOf('sabar'));
  });

  test('il tient compte de ce qui est déjà en poche', () => {
    const goal = nextGoal(walletWith({ stars: 100 }));
    assert.equal(goal!.missing, priceOf('sabar') - 100);
  });

  test('rien à viser une fois tout débloqué', () => {
    const complet = walletWith({
      stars: 0,
      unlocked: PIECE_SETS.map((set) => set.id),
    });
    assert.equal(nextGoal(complet), null);
  });
});

describe('robustesse', () => {
  test('le portefeuille reçu n’est jamais modifié', () => {
    const before = walletWith({ stars: 500 });
    credit(before, 'win');
    unlock(before, 'sabar');
    registerVisit(before, 42);

    assert.equal(before.stars, 500);
    assert.equal(before.unlocked.length, 1);
  });

  test('le solde ne devient jamais négatif', () => {
    let wallet = walletWith({ stars: priceOf('sabar') });
    wallet = unlock(wallet, 'sabar');
    assert.equal(wallet.stars, 0);

    wallet = unlock(wallet, 'teranga');
    assert.ok(wallet.stars >= 0);
    assert.ok(!isUnlocked(wallet, 'teranga'));
  });
});
