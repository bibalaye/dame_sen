import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  EMPTY_WALLET,
  REWARDS,
  buy,
  canAfford,
  credit,
  formatCoins,
  gameRewards,
  owns,
  registerVisit,
  totalOf,
  type Wallet,
} from '../economy.ts';
import { CATALOG, FREE_ITEMS, itemId, priceOfItem } from '../shop.ts';

const walletWith = (values: Partial<Wallet>): Wallet => ({ ...EMPTY_WALLET, ...values });

const SABAR = itemId('pieces', 'sabar');
const ENVOL = itemId('pieces', 'envol');
const WAX = itemId('board', 'wax');
const OFFERT = itemId('pieces', 'cauri');

describe('gains', () => {
  test('créditer augmente le solde et le total gagné', () => {
    const after = credit(EMPTY_WALLET, 'win');
    assert.equal(after.coins, REWARDS.win);
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
    assert.equal(wallet.coins, REWARDS['daily-login']);
    assert.equal(wallet.visitStreak, 1);
  });

  test('revenir le même jour ne rapporte rien', () => {
    const { wallet } = registerVisit(EMPTY_WALLET, 100);
    const second = registerVisit(wallet, 100);

    assert.deepEqual(second.rewards, []);
    assert.equal(second.wallet.coins, wallet.coins, 'le solde ne bouge pas');
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
    assert.equal(wallet.coins, REWARDS['daily-login'] * 7, 'aucune prime hebdomadaire');
  });
});

describe('achats', () => {
  test('ce qui est offert est acquis d’emblée', () => {
    assert.equal(priceOfItem(OFFERT), 0);
    assert.ok(owns(EMPTY_WALLET, OFFERT));
  });

  test('le reste est verrouillé au départ', () => {
    for (const item of CATALOG) {
      if (item.price === 0) continue;
      assert.ok(!owns(EMPTY_WALLET, item.id), `${item.id} devrait être verrouillé`);
    }
  });

  test('acheter débite le solde', () => {
    const riche = walletWith({ coins: 1000 });
    const after = buy(riche, SABAR);

    assert.ok(owns(after, SABAR));
    assert.equal(after.coins, 1000 - priceOfItem(SABAR));
  });

  test('toutes les familles s’achètent de la même façon', () => {
    let wallet = walletWith({ coins: 10_000 });
    for (const id of [SABAR, WAX, itemId('frame', 'laiton'), itemId('feature', 'indices')]) {
      wallet = buy(wallet, id);
      assert.ok(owns(wallet, id), `${id} devrait être acquis`);
    }
  });

  test('un solde insuffisant n’achète rien', () => {
    const pauvre = walletWith({ coins: 10 });
    assert.equal(buy(pauvre, ENVOL), pauvre, 'rien ne change');
    assert.ok(!canAfford(pauvre, ENVOL));
  });

  test('on ne paie jamais deux fois le même article', () => {
    const riche = walletWith({ coins: 2000 });
    const une = buy(riche, SABAR);
    const deux = buy(une, SABAR);

    assert.equal(deux.coins, une.coins, 'le second achat ne débite pas');
    assert.equal(deux.owned.length, une.owned.length);
  });

  test('acheter un article offert ne débite rien', () => {
    const wallet = walletWith({ coins: 500 });
    assert.equal(buy(wallet, OFFERT).coins, 500);
  });

  test('le total gagné survit aux achats', () => {
    let wallet = EMPTY_WALLET;
    for (let i = 0; i < 20; i++) wallet = credit(wallet, 'win');
    const gagne = wallet.earned;

    wallet = buy(wallet, SABAR);
    assert.equal(wallet.earned, gagne, 'dépenser n’efface pas ce qu’on a gagné');
    assert.ok(wallet.coins < gagne);
  });

  test('chaque article du catalogue a un prix', () => {
    for (const item of CATALOG) {
      assert.equal(typeof item.price, 'number', `prix manquant pour ${item.id}`);
      assert.ok(item.price >= 0, `prix négatif pour ${item.id}`);
    }
  });

  test('un joueur neuf possède exactement ce qui est offert', () => {
    assert.deepEqual([...EMPTY_WALLET.owned].sort(), [...FREE_ITEMS].sort());
  });
});

describe('écriture des sommes', () => {
  test('les milliers sont séparés', () => {
    assert.match(formatCoins(1250), /^1\s250$/);
  });

  test('les petites sommes restent telles quelles', () => {
    assert.equal(formatCoins(35), '35');
    assert.equal(formatCoins(0), '0');
  });

  test('une somme absente s’écrit zéro au lieu de tout faire tomber', () => {
    // Cas réel : le serveur n'a pas encore la colonne `coins` parce que le
    // schéma n'a pas été rejoué. L'affichage d'un solde n'est jamais un bon
    // endroit pour lever.
    assert.equal(formatCoins(undefined as unknown as number), '0');
    assert.equal(formatCoins(null as unknown as number), '0');
    assert.equal(formatCoins(NaN), '0');
    assert.equal(formatCoins(Infinity), '0');
  });
});

describe('robustesse', () => {
  test('le portefeuille reçu n’est jamais modifié', () => {
    const before = walletWith({ coins: 500 });
    credit(before, 'win');
    buy(before, SABAR);
    registerVisit(before, 42);

    assert.equal(before.coins, 500);
    assert.deepEqual(before.owned, EMPTY_WALLET.owned);
  });

  test('le solde ne devient jamais négatif', () => {
    let wallet = walletWith({ coins: priceOfItem(SABAR) });
    wallet = buy(wallet, SABAR);
    assert.equal(wallet.coins, 0);

    wallet = buy(wallet, ENVOL);
    assert.ok(wallet.coins >= 0);
    assert.ok(!owns(wallet, ENVOL));
  });
});
