/**
 * Économie du jeu : les cauris gagnés en jouant.
 *
 * Le cauri est le coquillage qui a servi de monnaie en Afrique de l'Ouest
 * pendant des siècles. C'est de l'argent, pas un score — et c'est ce qu'il faut
 * pour qu'une boutique ait du sens. Le mot ne demande aucune explication ici.
 *
 * Une seule monnaie, gagnée uniquement en jouant, dépensée pour du décor et
 * pour deux commodités de jeu solo. Rien ici ne touche à l'argent réel : ni
 * achat, ni publicité, ni retrait.
 *
 * Les gains ne portent jamais sur un avantage en partie contre un humain : rien
 * de ce qui s'achète ne change une règle.
 */

import {
  FREE_ITEMS,
  keepKnownItems,
  priceOfItem,
  type ItemId,
} from './shop.ts';

export type RewardReason =
  | 'played'
  | 'win'
  | 'streak'
  | 'daily-solved'
  | 'daily-login'
  | 'daily-login-week';

/**
 * Barème des gains, en cauris.
 *
 * Ce barème est écrit deux fois : ici et dans supabase/schema.sql. Le client
 * l'affiche, le serveur en décide. Un test compare les deux à chaque exécution.
 */
export const REWARDS: Readonly<Record<RewardReason, number>> = {
  played: 10,
  win: 25,
  streak: 100,
  'daily-solved': 50,
  'daily-login': 20,
  'daily-login-week': 500,
};

export const REWARD_LABELS: Readonly<Record<RewardReason, string>> = {
  played: 'Partie terminée',
  win: 'Victoire',
  streak: 'Trois victoires d’affilée',
  'daily-solved': 'Défi du jour résolu',
  'daily-login': 'Retour quotidien',
  'daily-login-week': 'Sept jours d’affilée',
};

export interface Wallet {
  readonly coins: number;
  /** Total gagné depuis le début, pour l'affichage des statistiques. */
  readonly earned: number;
  /** Articles possédés, toutes familles confondues. */
  readonly owned: readonly ItemId[];
  /** Numéro du dernier jour où la venue a été récompensée. */
  readonly lastVisitDay: number;
  /** Jours de venue consécutifs, pour le palier hebdomadaire. */
  readonly visitStreak: number;
}

export const EMPTY_WALLET: Wallet = {
  coins: 0,
  earned: 0,
  owned: FREE_ITEMS,
  lastVisitDay: 0,
  visitStreak: 0,
};

/** Vrai si l'article est acquis — ou offert, ce qui revient au même. */
export const owns = (wallet: Wallet, id: ItemId): boolean =>
  priceOfItem(id) === 0 || wallet.owned.includes(id);

export const canAfford = (wallet: Wallet, id: ItemId): boolean =>
  !owns(wallet, id) && wallet.coins >= priceOfItem(id);

/** Crédite un gain. Le total gagné ne baisse jamais, même après un achat. */
export const credit = (wallet: Wallet, reason: RewardReason): Wallet => {
  const amount = REWARDS[reason];
  return { ...wallet, coins: wallet.coins + amount, earned: wallet.earned + amount };
};

/**
 * Achète un article. Refuse si le solde ne suffit pas ou s'il est déjà acquis :
 * on ne débite jamais deux fois la même chose.
 */
export const buy = (wallet: Wallet, id: ItemId): Wallet => {
  if (owns(wallet, id)) return wallet;
  const price = priceOfItem(id);
  if (wallet.coins < price) return wallet;

  return { ...wallet, coins: wallet.coins - price, owned: [...wallet.owned, id] };
};

export interface VisitOutcome {
  readonly wallet: Wallet;
  /** Gains accordés pour cette venue, vide si le joueur est déjà passé. */
  readonly rewards: readonly RewardReason[];
}

/**
 * Récompense la venue du jour.
 *
 * Une seule fois par jour : revenir dans la même journée ne rapporte rien. Un
 * jour manqué remet la série à un — sans quoi le palier hebdomadaire
 * s'atteindrait en sept visites étalées sur trois mois.
 */
export const registerVisit = (wallet: Wallet, day: number): VisitOutcome => {
  if (wallet.lastVisitDay === day) return { wallet, rewards: [] };

  const continues = wallet.lastVisitDay === day - 1;
  const visitStreak = continues ? wallet.visitStreak + 1 : 1;

  const rewards: RewardReason[] = ['daily-login'];
  // Le septième jour, puis tous les sept jours suivants.
  if (visitStreak > 0 && visitStreak % 7 === 0) rewards.push('daily-login-week');

  let next: Wallet = { ...wallet, lastVisitDay: day, visitStreak };
  for (const reason of rewards) next = credit(next, reason);

  return { wallet: next, rewards };
};

/**
 * Gains d'une partie terminée : la participation, la victoire, et le palier de
 * trois victoires d'affilée.
 */
export const gameRewards = (
  won: boolean,
  currentStreak: number,
): readonly RewardReason[] => {
  const rewards: RewardReason[] = ['played'];
  if (won) rewards.push('win');
  if (won && currentStreak > 0 && currentStreak % 3 === 0) rewards.push('streak');
  return rewards;
};

export const totalOf = (rewards: readonly RewardReason[]): number =>
  rewards.reduce((sum, reason) => sum + REWARDS[reason], 0);

// --- Conservation locale ----------------------------------------------------

const STORAGE_KEY = 'dame-sen:wallet';

export const loadWallet = (): Wallet => {
  if (typeof window === 'undefined') return EMPTY_WALLET;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_WALLET;

    const parsed = JSON.parse(raw) as Record<string, unknown>;

    // `stars` et `unlocked` sont les noms d'avant la boutique. Les lire encore
    // évite d'effacer la progression de qui jouait déjà.
    const coins = Number(parsed.coins ?? parsed.stars) || 0;
    const anciens = Array.isArray(parsed.owned)
      ? (parsed.owned as string[])
      : Array.isArray(parsed.unlocked)
        ? (parsed.unlocked as string[])
        : [];

    return {
      coins: Math.max(0, coins),
      earned: Math.max(0, Number(parsed.earned) || 0),
      owned: keepKnownItems([...FREE_ITEMS, ...anciens]),
      lastVisitDay: Number(parsed.lastVisitDay) || 0,
      visitStreak: Math.max(0, Number(parsed.visitStreak) || 0),
    };
  } catch {
    return EMPTY_WALLET;
  }
};

export const saveWallet = (wallet: Wallet): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(wallet));
  } catch {
    // Sans stockage, les cauris ne valent que pour la session.
  }
};

/** Écriture des sommes : « 1 250 » se lit mieux que « 1250 ». */
export const formatCoins = (amount: number): string =>
  amount.toLocaleString('fr-FR').replace(/ | /g, ' ');
