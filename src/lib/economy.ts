/**
 * Économie du jeu : les étoiles gagnées en jouant.
 *
 * Une seule monnaie, gagnée uniquement en jouant, et dépensée pour débloquer
 * des éléments décoratifs. Rien ici ne touche à l'argent réel : ni achat, ni
 * publicité, ni retrait. Cette couche a du sens quelle que soit la suite —
 * elle donne une raison de revenir et rend les pions désirables — et elle ne
 * dépend d'aucune décision commerciale.
 *
 * Les gains ne portent que sur le décor : rien de ce qui s'achète ici ne change
 * une règle ni ne donne un avantage en partie.
 */

import { PIECE_SETS, type PieceSetId } from './pieceSets.ts';

export type RewardReason =
  | 'played'
  | 'win'
  | 'streak'
  | 'daily-solved'
  | 'daily-login'
  | 'daily-login-week';

/** Barème des gains, en étoiles. */
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

/**
 * Prix des jeux de pions. Le premier est offert : on ne démarre jamais sans
 * pièces, et le second est à portée de quelques parties.
 */
export const PIECE_SET_PRICES: Readonly<Record<PieceSetId, number>> = {
  cauri: 0,
  sabar: 300,
  teranga: 600,
  baobab: 1000,
  donjon: 1500,
  jetons: 2000,
};

export interface Wallet {
  readonly stars: number;
  /** Total gagné depuis le début, pour l'affichage des statistiques. */
  readonly earned: number;
  readonly unlocked: readonly PieceSetId[];
  /** Numéro du dernier jour où la venue a été récompensée. */
  readonly lastVisitDay: number;
  /** Jours de venue consécutifs, pour le palier hebdomadaire. */
  readonly visitStreak: number;
}

export const EMPTY_WALLET: Wallet = {
  stars: 0,
  earned: 0,
  unlocked: ['cauri'],
  lastVisitDay: 0,
  visitStreak: 0,
};

export const isUnlocked = (wallet: Wallet, id: PieceSetId): boolean =>
  PIECE_SET_PRICES[id] === 0 || wallet.unlocked.includes(id);

export const priceOf = (id: PieceSetId): number => PIECE_SET_PRICES[id] ?? 0;

export const canAfford = (wallet: Wallet, id: PieceSetId): boolean =>
  !isUnlocked(wallet, id) && wallet.stars >= priceOf(id);

/** Crédite un gain. Le total gagné ne baisse jamais, même après un achat. */
export const credit = (wallet: Wallet, reason: RewardReason): Wallet => {
  const amount = REWARDS[reason];
  return { ...wallet, stars: wallet.stars + amount, earned: wallet.earned + amount };
};

/**
 * Débloque un jeu de pions. Refuse si le solde ne suffit pas ou s'il est déjà
 * acquis : on ne débite jamais deux fois la même chose.
 */
export const unlock = (wallet: Wallet, id: PieceSetId): Wallet => {
  if (isUnlocked(wallet, id)) return wallet;
  const price = priceOf(id);
  if (wallet.stars < price) return wallet;

  return { ...wallet, stars: wallet.stars - price, unlocked: [...wallet.unlocked, id] };
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

/** Ce qu'il reste à gagner pour s'offrir le prochain jeu de pions. */
export const nextGoal = (
  wallet: Wallet,
): { id: PieceSetId; missing: number } | null => {
  const locked = PIECE_SETS.filter((set) => !isUnlocked(wallet, set.id)).sort(
    (a, b) => priceOf(a.id) - priceOf(b.id),
  );
  if (locked.length === 0) return null;

  const next = locked[0];
  return { id: next.id, missing: Math.max(0, priceOf(next.id) - wallet.stars) };
};

// --- Conservation locale ----------------------------------------------------

const STORAGE_KEY = 'dame-sen:wallet';

export const loadWallet = (): Wallet => {
  if (typeof window === 'undefined') return EMPTY_WALLET;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_WALLET;

    const parsed = JSON.parse(raw) as Partial<Wallet>;
    const known = new Set(PIECE_SETS.map((set) => set.id));

    return {
      stars: Math.max(0, Number(parsed.stars) || 0),
      earned: Math.max(0, Number(parsed.earned) || 0),
      // Un identifiant disparu d'une version à l'autre ne doit pas tout casser.
      unlocked: Array.isArray(parsed.unlocked)
        ? (parsed.unlocked.filter((id) => known.has(id as PieceSetId)) as PieceSetId[])
        : EMPTY_WALLET.unlocked,
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
    // Sans stockage, les étoiles ne valent que pour la session.
  }
};
