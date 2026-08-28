/**
 * Historique des parties.
 *
 * Une partie terminée ne laissait aucune trace : le score de la série
 * disparaissait en quittant la table, et rien ne disait si l'on progressait.
 * Ce module conserve les résultats sur l'appareil et en tire de quoi se situer —
 * séries en cours, meilleure série, taux de victoire par adversaire.
 *
 * Comme les autres modules de règles, il est pur : le stockage est isolé dans
 * deux fonctions, tout le reste se calcule et se teste sans navigateur.
 */

export type GameKindId = 'dames' | 'morpion';
export type GameModeId = 'solo' | 'pass' | 'online' | 'daily';
export type GameResult = 'win' | 'loss' | 'draw';

export interface HistoryEntry {
  readonly id: string;
  readonly game: GameKindId;
  readonly mode: GameModeId;
  readonly result: GameResult;
  /** Nom affiché de l'adversaire : personnage, pseudo, ou camp adverse. */
  readonly opponent: string;
  /** Horodatage de la fin de partie. */
  readonly playedAt: number;
  /** Fait marquant : plus longue rafle, nombre de coups, défi résolu… */
  readonly detail?: string;
}

/**
 * Nombre de parties conservées. Au-delà, les plus anciennes sont oubliées :
 * le stockage du navigateur est limité, et personne ne relit sa millième partie.
 */
export const HISTORY_LIMIT = 200;

const STORAGE_KEY = 'dame-sen:history';

export interface Stats {
  readonly played: number;
  readonly wins: number;
  readonly losses: number;
  readonly draws: number;
  /** Part de victoires, entre 0 et 1. Vaut 0 sans aucune partie. */
  readonly winRate: number;
  /** Victoires consécutives en cours, en partant de la plus récente. */
  readonly currentStreak: number;
  /** La plus longue série de victoires jamais réalisée. */
  readonly bestStreak: number;
}

const EMPTY_STATS: Stats = {
  played: 0,
  wins: 0,
  losses: 0,
  draws: 0,
  winRate: 0,
  currentStreak: 0,
  bestStreak: 0,
};

/**
 * Les entrées sont rangées de la plus récente à la plus ancienne : la série en
 * cours se lit donc depuis le début de la liste.
 */
export const computeStats = (entries: readonly HistoryEntry[]): Stats => {
  if (entries.length === 0) return EMPTY_STATS;

  let wins = 0;
  let losses = 0;
  let draws = 0;

  for (const entry of entries) {
    if (entry.result === 'win') wins++;
    else if (entry.result === 'loss') losses++;
    else draws++;
  }

  let currentStreak = 0;
  for (const entry of entries) {
    if (entry.result !== 'win') break;
    currentStreak++;
  }

  // La meilleure série se cherche dans l'ordre chronologique ou inverse : une
  // suite de victoires a la même longueur dans les deux sens.
  let bestStreak = 0;
  let run = 0;
  for (const entry of entries) {
    if (entry.result === 'win') {
      run++;
      if (run > bestStreak) bestStreak = run;
    } else {
      run = 0;
    }
  }

  return {
    played: entries.length,
    wins,
    losses,
    draws,
    winRate: wins / entries.length,
    currentStreak,
    bestStreak,
  };
};

/** Restreint l'historique à un jeu, pour des statistiques par plateau. */
export const filterByGame = (
  entries: readonly HistoryEntry[],
  game: GameKindId,
): HistoryEntry[] => entries.filter((entry) => entry.game === game);

/** Ajoute une partie en tête, et oublie les plus anciennes au-delà de la limite. */
export const addEntry = (
  entries: readonly HistoryEntry[],
  entry: HistoryEntry,
): HistoryEntry[] => [entry, ...entries].slice(0, HISTORY_LIMIT);

/** Identifiant d'une partie : l'horodatage suffit, avec un suffixe de secours. */
export const makeEntryId = (playedAt: number, salt = ''): string =>
  `${playedAt.toString(36)}${salt}`;

// --- Stockage ---------------------------------------------------------------

const isEntry = (value: unknown): value is HistoryEntry => {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<HistoryEntry>;
  return (
    typeof entry.id === 'string' &&
    (entry.game === 'dames' || entry.game === 'morpion') &&
    (entry.result === 'win' || entry.result === 'loss' || entry.result === 'draw') &&
    typeof entry.playedAt === 'number'
  );
};

export const loadHistory = (): HistoryEntry[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Un stockage abîmé ou d'une version antérieure ne doit pas casser l'écran.
    return parsed.filter(isEntry).slice(0, HISTORY_LIMIT);
  } catch {
    return [];
  }
};

export const saveHistory = (entries: readonly HistoryEntry[]): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Navigation privée ou quota atteint : l'historique vaut pour la session.
  }
};

export const clearHistory = (): void => {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Sans stockage, il n'y avait rien à effacer.
  }
};

/** Libellé court d'une date, pour la liste des parties. */
export const formatWhen = (playedAt: number, now: number = Date.now()): string => {
  const minutes = Math.floor((now - playedAt) / 60_000);
  if (minutes < 1) return 'à l’instant';
  if (minutes < 60) return `il y a ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;

  const days = Math.floor(hours / 24);
  if (days === 1) return 'hier';
  if (days < 7) return `il y a ${days} jours`;

  return new Date(playedAt).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
  });
};
