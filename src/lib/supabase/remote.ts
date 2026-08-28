/**
 * Le profil du joueur, côté serveur.
 *
 * Toutes les fonctions de ce module supportent l'absence de serveur : elles
 * rendent alors `null` sans lever. Les appelants n'ont donc qu'un seul cas
 * particulier à traiter — « pas de compte » — et non deux.
 *
 * Aucun gain n'est calculé ici. Le client demande, le serveur accorde : les
 * étoiles arrivent en réponse des fonctions distantes, jamais d'un calcul local
 * qu'il suffirait de contourner.
 */

import type { PostgrestError } from '@supabase/supabase-js';

import { getSupabase } from './client';
import {
  displayNameFrom,
  explainAuthError,
  internalEmail,
  normalizeHandle,
  type Account,
} from '../account';
import { EMPTY_PROFILE, type PlayerProfile } from '../profile';
import { PIECE_SETS, DEFAULT_PIECE_SET, type PieceSetId } from '../pieceSets';
import type { HistoryEntry } from '../history';
import type { RewardReason } from '../economy';

/** Ce que le serveur renvoie pour la table des profils. */
interface ProfileRow {
  id: string;
  handle: string;
  display_name: string;
  stars: number;
  earned: number;
  unlocked: string[] | null;
  piece_set: string;
  last_visit_day: number;
  visit_streak: number;
  daily_last_number: number;
  daily_streak: number;
  daily_solved_count: number;
  created_at: string;
}

interface GameRow {
  id: string;
  game: string;
  mode: string;
  result: string;
  opponent: string | null;
  detail: string | null;
  played_at: number;
}

export interface RemoteState {
  readonly account: Account;
  readonly profile: PlayerProfile;
}

export type Outcome<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: string };

const fail = (error: string): Outcome<never> => ({ ok: false, error });

const KNOWN_SETS = new Set<string>(PIECE_SETS.map((set) => set.id));

/** N'accepte qu'un identifiant que cette version connaît. */
const asPieceSet = (value: string | null | undefined): PieceSetId =>
  value && KNOWN_SETS.has(value) ? (value as PieceSetId) : DEFAULT_PIECE_SET;

const rowToAccount = (row: ProfileRow): Account => ({
  id: row.id,
  handle: row.handle,
  displayName: row.display_name,
  createdAt: Date.parse(row.created_at) || Date.now(),
});

const rowsToHistory = (rows: readonly GameRow[]): HistoryEntry[] =>
  rows.map((row) => ({
    id: row.id,
    game: row.game as HistoryEntry['game'],
    mode: row.mode as HistoryEntry['mode'],
    result: row.result as HistoryEntry['result'],
    opponent: row.opponent ?? '',
    playedAt: Number(row.played_at),
    ...(row.detail ? { detail: row.detail } : {}),
  }));

const rowToProfile = (row: ProfileRow, games: readonly GameRow[]): PlayerProfile => ({
  wallet: {
    stars: row.stars,
    earned: row.earned,
    unlocked: (row.unlocked ?? ['cauri']).filter((id): id is PieceSetId =>
      KNOWN_SETS.has(id),
    ),
    lastVisitDay: row.last_visit_day,
    visitStreak: row.visit_streak,
  },
  history: rowsToHistory(games),
  daily: {
    lastNumber: row.daily_last_number,
    streak: row.daily_streak,
    solvedCount: row.daily_solved_count,
  },
  pieceSet: asPieceSet(row.piece_set),
});

/** Formate une erreur PostgREST ou inconnue pour qu'elle ne soit jamais affichée vide ({}) */
export const formatRemoteError = (error: unknown): string => {
  if (!error) return 'erreur inconnue';
  if (typeof error === 'string') return error;
  if (error instanceof Error) {
    return error.message || error.stack || String(error);
  }
  if (typeof error === 'object') {
    const err = error as { message?: string; details?: string; hint?: string; code?: string };
    const parts = [
      err.message,
      err.details,
      err.hint,
      err.code ? `(code ${err.code})` : '',
    ].filter(Boolean);
    if (parts.length > 0) return parts.join(' - ');
    try {
      return JSON.stringify(error, Object.getOwnPropertyNames(error));
    } catch {
      return String(error);
    }
  }
  return String(error);
};

/**
 * Traduit une panne du serveur en une phrase compréhensible. Le détail
 * technique part dans la console : utile au développement, illisible pour un
 * joueur.
 */
const explainDbError = (error: PostgrestError | Error, fallback: string): string => {
  console.error('[compte]', formatRemoteError(error), error);
  const message = 'message' in error && error.message ? error.message : formatRemoteError(error);

  if (message.includes('solde insuffisant')) return 'Vous n’avez pas assez d’étoiles.';
  if (message.includes('non debloque')) return 'Ce jeu de pions n’est pas encore à vous.';
  if (message.includes('duplicate key') && message.includes('handle')) {
    return 'Ce pseudo est déjà pris.';
  }
  if (message.toLowerCase().includes('fetch')) {
    return 'Serveur injoignable. Vérifiez votre connexion.';
  }
  return fallback;
};

// --- Session ----------------------------------------------------------------

/** Charge le profil du compte connecté, ou `null` si personne ne l'est. */
export const loadRemoteState = async (): Promise<RemoteState | null> => {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data: session } = await supabase.auth.getUser();
  if (!session.user) return null;

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .maybeSingle<ProfileRow>();

  if (error || !profile) {
    if (error) console.error('[compte] profil illisible', formatRemoteError(error), error);
    return null;
  }

  const { data: games } = await supabase
    .from('games')
    .select('id, game, mode, result, opponent, detail, played_at')
    .eq('player_id', session.user.id)
    .order('played_at', { ascending: false })
    .limit(200);

  return {
    account: rowToAccount(profile),
    profile: rowToProfile(profile, (games as GameRow[] | null) ?? []),
  };
};

export const signUp = async (
  rawHandle: string,
  password: string,
): Promise<Outcome<RemoteState>> => {
  const supabase = getSupabase();
  if (!supabase) return fail('Les comptes ne sont pas disponibles.');

  const handle = normalizeHandle(rawHandle);
  const { error } = await supabase.auth.signUp({
    email: internalEmail(handle),
    password,
  });

  if (error) return fail(explainAuthError(error.message, 'signup'));

  // Le compte existe, le profil pas encore : sans lui, le joueur n'aurait ni
  // pseudo affichable ni portefeuille.
  const { data, error: rpcError } = await supabase
    .rpc('create_profile', {
      p_handle: handle,
      p_display_name: displayNameFrom(rawHandle),
    })
    .single<ProfileRow>();

  if (rpcError || !data) {
    return fail(
      explainDbError(rpcError ?? new Error('profil absent'), 'La création du compte a échoué.'),
    );
  }

  return {
    ok: true,
    value: { account: rowToAccount(data), profile: rowToProfile(data, []) },
  };
};

export const signIn = async (
  rawHandle: string,
  password: string,
): Promise<Outcome<RemoteState>> => {
  const supabase = getSupabase();
  if (!supabase) return fail('Les comptes ne sont pas disponibles.');

  const { error } = await supabase.auth.signInWithPassword({
    email: internalEmail(rawHandle),
    password,
  });

  if (error) return fail(explainAuthError(error.message, 'signin'));

  const state = await loadRemoteState();
  if (!state) return fail('Profil introuvable.');

  return { ok: true, value: state };
};

export const signOut = async (): Promise<void> => {
  await getSupabase()?.auth.signOut();
};

// --- Gains et progression ----------------------------------------------------

/** Réponse commune des fonctions qui accordent des étoiles. */
export interface RewardOutcome {
  readonly rewards: readonly RewardReason[];
  readonly stars: number;
}

const asRewardOutcome = (payload: unknown, fallbackStars: number): RewardOutcome => {
  const data = (payload ?? {}) as { rewards?: unknown; stars?: unknown };
  return {
    rewards: Array.isArray(data.rewards) ? (data.rewards as RewardReason[]) : [],
    stars: typeof data.stars === 'number' ? data.stars : fallbackStars,
  };
};

/** Récompense la venue du jour. Le serveur décide de la date. */
export const claimDailyVisit = async (
  currentStars: number,
): Promise<RewardOutcome | null> => {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase.rpc('claim_daily_visit');
  if (error) {
    console.error('[compte] venue du jour:', formatRemoteError(error), error);
    return null;
  }
  return asRewardOutcome(data, currentStars);
};

/** Consigne une partie terminée et récupère les étoiles accordées. */
export const recordGameRemote = async (
  entry: HistoryEntry,
  currentStars: number,
): Promise<RewardOutcome | null> => {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase.rpc('record_game', {
    p_id: entry.id,
    p_game: entry.game,
    p_mode: entry.mode,
    p_result: entry.result,
    p_opponent: entry.opponent ?? '',
    p_detail: entry.detail ?? null,
    p_played_at: entry.playedAt,
  });

  if (error) {
    console.error('[compte] partie non enregistrée:', formatRemoteError(error), error);
    return null;
  }
  return asRewardOutcome(data, currentStars);
};

export const recordDailyRemote = async (
  number: number,
  solved: boolean,
  currentStars: number,
): Promise<RewardOutcome | null> => {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase.rpc('record_daily', {
    p_number: number,
    p_solved: solved,
  });

  if (error) {
    console.error('[compte] défi non enregistré:', formatRemoteError(error), error);
    return null;
  }
  return asRewardOutcome(data, currentStars);
};

export const unlockPieceSetRemote = async (
  id: PieceSetId,
): Promise<Outcome<{ stars: number; unlocked: PieceSetId[] }>> => {
  const supabase = getSupabase();
  if (!supabase) return fail('Les comptes ne sont pas disponibles.');

  const { data, error } = await supabase.rpc('unlock_piece_set', { p_set_id: id });
  if (error) return fail(explainDbError(error, 'Le déblocage a échoué.'));

  const payload = (data ?? {}) as { stars?: number; unlocked?: string[] };
  return {
    ok: true,
    value: {
      stars: payload.stars ?? 0,
      unlocked: (payload.unlocked ?? []).filter((set): set is PieceSetId =>
        KNOWN_SETS.has(set),
      ),
    },
  };
};

export const setPieceSetRemote = async (id: PieceSetId): Promise<void> => {
  const supabase = getSupabase();
  if (!supabase) return;

  const { error } = await supabase.rpc('set_piece_set', { p_set_id: id });
  if (error) console.error('[compte] choix de pions non conservé:', formatRemoteError(error), error);
};

/**
 * Reprend la progression faite avant la création du compte. Le serveur refuse
 * le second appel et plafonne les étoiles : il n'y a donc rien à vérifier ici.
 */
export const importLocalProgress = async (
  stars: number,
  games: readonly HistoryEntry[],
): Promise<{ stars: number; games: number } | null> => {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase.rpc('import_local_progress', {
    p_stars: stars,
    p_games: games.map((entry) => ({
      id: entry.id,
      game: entry.game,
      mode: entry.mode,
      result: entry.result,
      opponent: entry.opponent ?? '',
      detail: entry.detail ?? null,
      playedAt: entry.playedAt,
    })),
  });

  if (error) {
    console.error('[compte] reprise impossible:', formatRemoteError(error), error);
    return null;
  }

  const payload = (data ?? {}) as { stars?: number; games?: number };
  return { stars: payload.stars ?? 0, games: payload.games ?? 0 };
};

// --- Classement --------------------------------------------------------------

export interface LeaderboardRow {
  readonly displayName: string;
  readonly handle: string;
  readonly wins: number;
  readonly played: number;
}

export const fetchLeaderboard = async (): Promise<LeaderboardRow[]> => {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('leaderboard')
    .select('display_name, handle, wins, played')
    .limit(50);

  if (error) {
    console.error('[compte] classement indisponible:', formatRemoteError(error), error);
    return [];
  }

  return ((data ?? []) as { display_name: string; handle: string; wins: number; played: number }[]).map(
    (row) => ({
      displayName: row.display_name,
      handle: row.handle,
      wins: Number(row.wins),
      played: Number(row.played),
    }),
  );
};

export { EMPTY_PROFILE };
