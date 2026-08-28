/**
 * Le profil d'un joueur : tout ce qui le suit d'un appareil à l'autre.
 *
 * Jusqu'ici, chaque morceau vivait dans sa propre clé du navigateur — cauris,
 * historique, série du défi, pions choisis. Vider le cache effaçait tout, et
 * changer de téléphone repartait de zéro. Un compte rassemble ces morceaux en
 * un seul objet, que le serveur conserve.
 *
 * Ce module ne parle à personne : il assemble, compare et fusionne. La partie
 * réseau est ailleurs, ce qui rend toutes les règles de fusion testables — et
 * elles en ont besoin, car c'est là qu'on perd des données sans s'en rendre
 * compte.
 */

import { EMPTY_WALLET, type Wallet } from './economy.ts';
import { HISTORY_LIMIT, type HistoryEntry } from './history.ts';
import { DEFAULT_PIECE_SET } from './pieceSets.ts';
import { DEFAULT_BOARD_THEME } from './boards.ts';
import { priceOfItem, type ItemId, type Loadout } from './shop.ts';
import type { DailyProgress } from './daily.ts';

/** Ce qu'un joueur porte par défaut : le décor offert, aucun titre. */
export const EMPTY_LOADOUT: Loadout = {
  pieces: DEFAULT_PIECE_SET,
  board: DEFAULT_BOARD_THEME,
  frame: null,
  title: null,
};

export interface PlayerProfile {
  readonly wallet: Wallet;
  /** De la partie la plus récente à la plus ancienne. */
  readonly history: readonly HistoryEntry[];
  readonly daily: DailyProgress;
  /** Ce que le joueur porte : pions, plateau, cadre, titre. */
  readonly loadout: Loadout;
}

export const EMPTY_DAILY: DailyProgress = {
  lastNumber: 0,
  streak: 0,
  solvedCount: 0,
};

export const EMPTY_PROFILE: PlayerProfile = {
  wallet: EMPTY_WALLET,
  history: [],
  daily: EMPTY_DAILY,
  loadout: EMPTY_LOADOUT,
};

/**
 * Réunit deux historiques sans doublon ni perte.
 *
 * Une partie jouée hors ligne sur le téléphone et une autre jouée sur
 * l'ordinateur doivent toutes deux survivre. L'identifiant d'une partie dérive
 * de son horodatage : deux appareils ne produisent donc pas le même
 * identifiant pour deux parties différentes, et rejouer la même entrée deux
 * fois est sans effet.
 */
export const mergeHistory = (
  a: readonly HistoryEntry[],
  b: readonly HistoryEntry[],
): HistoryEntry[] => {
  const byId = new Map<string, HistoryEntry>();
  for (const entry of [...a, ...b]) {
    // La première rencontrée gagne : l'ordre des arguments décide de la source
    // faisant foi en cas d'identifiant identique.
    if (!byId.has(entry.id)) byId.set(entry.id, entry);
  }

  return [...byId.values()]
    .sort((x, y) => y.playedAt - x.playedAt)
    .slice(0, HISTORY_LIMIT);
};

/**
 * Fusionne deux séries de défis en gardant la plus avancée. On ne compare pas
 * les séries entre elles mais les jours atteints : une série de 5 arrêtée il y
 * a un mois ne doit pas écraser une série de 2 toujours vivante.
 */
export const mergeDaily = (a: DailyProgress, b: DailyProgress): DailyProgress => {
  const recent = a.lastNumber >= b.lastNumber ? a : b;

  return {
    lastNumber: recent.lastNumber,
    streak: recent.streak,
    // Le total de défis résolus se cumule mal : sans identifiant par défi, on
    // garde le plus élevé plutôt que d'additionner des jours peut-être communs.
    solvedCount: Math.max(a.solvedCount, b.solvedCount),
  };
};

/**
 * Fusionne les portefeuilles. Le solde du serveur fait foi — c'est lui qui
 * accorde les cauris, et un solde local se modifie en deux clics dans le
 * navigateur. Les déblocages, eux, se réunissent : rien de ce qui a été acquis
 * ne doit disparaître, même acquis sur l'autre appareil.
 */
export const mergeWallet = (local: Wallet, remote: Wallet): Wallet => ({
  coins: remote.coins,
  earned: remote.earned,
  owned: [...new Set([...local.owned, ...remote.owned])],
  lastVisitDay: Math.max(local.lastVisitDay, remote.lastVisitDay),
  visitStreak:
    remote.lastVisitDay >= local.lastVisitDay ? remote.visitStreak : local.visitStreak,
});

/**
 * Fusionne les tenues. Le compte impose ce qu'il porte, sauf là où il n'a
 * jamais rien choisi : le réglage d'usine ne doit pas écraser un choix fait sur
 * cet appareil. Un cadre ou un titre absent du compte n'est pas un choix, c'est
 * une absence — le local reprend donc la main.
 */
export const mergeLoadout = (local: Loadout, remote: Loadout): Loadout => ({
  pieces: remote.pieces === DEFAULT_PIECE_SET ? local.pieces : remote.pieces,
  board: remote.board === DEFAULT_BOARD_THEME ? local.board : remote.board,
  frame: remote.frame ?? local.frame,
  title: remote.title ?? local.title,
});

/**
 * Ce qu'on obtient en se connectant sur un appareil qui a déjà servi : le
 * compte apporte le solde et l'acquis, l'appareil apporte les parties que le
 * compte ne connaît pas encore.
 */
export const mergeProfiles = (
  local: PlayerProfile,
  remote: PlayerProfile,
): PlayerProfile => ({
  wallet: mergeWallet(local.wallet, remote.wallet),
  // Le compte est cité en premier : à identifiant égal, sa version l'emporte.
  history: mergeHistory(remote.history, local.history),
  daily: mergeDaily(local.daily, remote.daily),
  loadout: mergeLoadout(local.loadout, remote.loadout),
});

/**
 * Plafond des cauris repris d'une progression hors compte.
 *
 * Le contenu du navigateur se modifie à la main : reprendre un solde local sans
 * limite reviendrait à distribuer des cauris à qui sait ouvrir une console.
 * Le plafond laisse passer une progression honnête — plusieurs dizaines de
 * parties — et coupe le reste. Rien d'argent réel n'étant en jeu, mieux vaut
 * cette limite simple qu'un dispositif compliqué.
 */
export const IMPORT_COIN_CAP = 1000;

export interface ImportSummary {
  readonly coins: number;
  readonly games: number;
  readonly owned: readonly ItemId[];
  /** Vrai si le solde a été rogné : le joueur doit savoir pourquoi. */
  readonly capped: boolean;
}

/**
 * Ce qu'une progression locale apporte à un compte tout neuf. Appelé une seule
 * fois, à l'inscription : ensuite, seul le serveur crédite.
 */
export const summarizeImport = (local: PlayerProfile): ImportSummary => {
  const coins = Math.min(local.wallet.coins, IMPORT_COIN_CAP);
  return {
    coins,
    games: Math.min(local.history.length, HISTORY_LIMIT),
    owned: local.wallet.owned,
    capped: local.wallet.coins > IMPORT_COIN_CAP,
  };
};

/**
 * Vrai si l'appareil a de quoi être repris : sans cela, on ne propose rien.
 *
 * On cherche un article réellement payé, et non un inventaire plus long que
 * celui d'origine : les articles offerts y figurent aussi, et leur nombre
 * change à chaque ajout au catalogue.
 */
export const hasLocalProgress = (local: PlayerProfile): boolean =>
  local.history.length > 0 ||
  local.wallet.earned > 0 ||
  local.wallet.owned.some((id) => priceOfItem(id) > 0);
