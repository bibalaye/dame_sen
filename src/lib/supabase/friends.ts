/**
 * Amis et invitations.
 *
 * Partager un code de salle à six caractères marchait, mais obligeait à sortir
 * du jeu pour l'envoyer par un autre moyen. Une liste d'amis permet d'inviter
 * d'un geste — et de recevoir l'invitation sans rien recopier.
 *
 * Le code de salle vient du serveur de parties, qui ne connaît pas les
 * comptes ; la table des invitations fait le lien entre les deux, sans que l'un
 * ait à connaître l'autre.
 */

import type { RealtimeChannel } from '@supabase/supabase-js';

import { getSupabase } from './client';
import { formatRemoteError } from './remote';

export interface PlayerCard {
  readonly handle: string;
  readonly displayName: string;
  readonly title: string | null;
  readonly frame: string | null;
}

export interface FriendLists {
  readonly friends: readonly PlayerCard[];
  /** Demandes qu'on a reçues et auxquelles il faut répondre. */
  readonly received: readonly PlayerCard[];
  /** Demandes qu'on a envoyées et qui attendent. */
  readonly sent: readonly PlayerCard[];
}

export const EMPTY_FRIENDS: FriendLists = { friends: [], received: [], sent: [] };

export interface GameInvite {
  readonly id: string;
  readonly roomId: string;
  readonly game: 'dames' | 'morpion';
  readonly handle: string;
  readonly displayName: string;
}

export type Outcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: string };

/** Traduit les refus du serveur en une phrase adressée au joueur. */
const expliquer = (error: unknown, repli: string): string => {
  const message = formatRemoteError(error);
  console.error('[amis]', message, error);

  if (message.includes('joueur introuvable')) return 'Ce joueur n’existe pas.';
  if (message.includes('pas soi meme')) return 'Vous ne pouvez pas vous ajouter vous-même.';
  if (message.includes('pas ami')) return 'Vous n’êtes pas encore amis.';
  if (message.toLowerCase().includes('fetch')) {
    return 'Serveur injoignable. Vérifiez votre connexion.';
  }
  return repli;
};

const asCards = (value: unknown): PlayerCard[] =>
  Array.isArray(value)
    ? value.map((row) => {
        const card = row as Record<string, unknown>;
        return {
          handle: String(card.handle ?? ''),
          displayName: String(card.displayName ?? card.handle ?? ''),
          title: (card.title as string | null) ?? null,
          frame: (card.frame as string | null) ?? null,
        };
      })
    : [];

// --- Recherche ---------------------------------------------------------------

export const searchPlayers = async (query: string): Promise<PlayerCard[]> => {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data, error } = await supabase.rpc('search_players', { p_query: query });
  if (error) {
    console.error('[amis] recherche', formatRemoteError(error), error);
    return [];
  }

  // La fonction renvoie des colonnes SQL, pas du JSON : les noms sont ceux de
  // la base.
  return (data ?? []).map((row: Record<string, unknown>) => ({
    handle: String(row.handle ?? ''),
    displayName: String(row.display_name ?? row.handle ?? ''),
    title: (row.title as string | null) ?? null,
    frame: (row.frame as string | null) ?? null,
  }));
};

// --- Amitiés -----------------------------------------------------------------

export const listFriends = async (): Promise<FriendLists> => {
  const supabase = getSupabase();
  if (!supabase) return EMPTY_FRIENDS;

  const { data, error } = await supabase.rpc('list_friends');
  if (error) {
    console.error('[amis] liste', formatRemoteError(error), error);
    return EMPTY_FRIENDS;
  }

  const payload = (data ?? {}) as Record<string, unknown>;
  return {
    friends: asCards(payload.friends),
    received: asCards(payload.received),
    sent: asCards(payload.sent),
  };
};

export const sendFriendRequest = async (handle: string): Promise<Outcome> => {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Les comptes ne sont pas disponibles.' };

  const { error } = await supabase.rpc('send_friend_request', { p_handle: handle });
  if (error) return { ok: false, error: expliquer(error, 'La demande n’a pas pu partir.') };

  return { ok: true };
};

export const respondFriendRequest = async (
  handle: string,
  accept: boolean,
): Promise<Outcome> => {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Les comptes ne sont pas disponibles.' };

  const { error } = await supabase.rpc('respond_friend_request', {
    p_handle: handle,
    p_accept: accept,
  });
  if (error) return { ok: false, error: expliquer(error, 'La réponse n’a pas pu partir.') };

  return { ok: true };
};

export const removeFriend = async (handle: string): Promise<Outcome> => {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Les comptes ne sont pas disponibles.' };

  const { error } = await supabase.rpc('remove_friend', { p_handle: handle });
  if (error) return { ok: false, error: expliquer(error, 'Le retrait a échoué.') };

  return { ok: true };
};

// --- Invitations -------------------------------------------------------------

export const inviteFriend = async (
  handle: string,
  roomId: string,
  game: 'dames' | 'morpion',
): Promise<Outcome> => {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Les comptes ne sont pas disponibles.' };

  const { error } = await supabase.rpc('invite_friend', {
    p_handle: handle,
    p_room: roomId,
    p_game: game,
  });
  if (error) return { ok: false, error: expliquer(error, 'L’invitation n’a pas pu partir.') };

  return { ok: true };
};

export const pendingInvites = async (): Promise<GameInvite[]> => {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data, error } = await supabase.rpc('pending_invites');
  if (error) {
    console.error('[amis] invitations', formatRemoteError(error), error);
    return [];
  }

  return Array.isArray(data)
    ? data.map((row: Record<string, unknown>) => ({
        id: String(row.id ?? ''),
        roomId: String(row.roomId ?? ''),
        game: (row.game === 'morpion' ? 'morpion' : 'dames') as GameInvite['game'],
        handle: String(row.handle ?? ''),
        displayName: String(row.displayName ?? row.handle ?? ''),
      }))
    : [];
};

export const dismissInvite = async (id: string): Promise<void> => {
  const supabase = getSupabase();
  if (!supabase) return;

  const { error } = await supabase.rpc('dismiss_invite', { p_id: id });
  if (error) console.error('[amis] fermeture', formatRemoteError(error), error);
};

/**
 * Prévient dès qu'une invitation arrive, sans interroger le serveur en boucle.
 *
 * L'événement ne porte que la ligne insérée — pas le nom de qui invite, qui est
 * dans une autre table. On s'en sert donc comme d'une sonnette : elle dit qu'il
 * s'est passé quelque chose, et l'appelant va lire la liste complète.
 *
 * Rend une fonction d'arrêt, ou `null` si aucun serveur n'est configuré.
 */
export const watchInvites = (
  accountId: string,
  onRing: () => void,
): (() => void) | null => {
  const supabase = getSupabase();
  if (!supabase) return null;

  const channel: RealtimeChannel = supabase
    .channel(`invites-${accountId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'game_invites',
        filter: `to_id=eq.${accountId}`,
      },
      () => onRing(),
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
};
