'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { useAccount } from './AccountContext';
import {
  EMPTY_FRIENDS,
  dismissInvite as dismissRemote,
  inviteFriend as inviteRemote,
  listFriends,
  pendingInvites,
  removeFriend as removeRemote,
  respondFriendRequest,
  searchPlayers,
  sendFriendRequest,
  watchInvites,
  type FriendLists,
  type GameInvite,
  type PlayerCard,
} from '@/lib/supabase/friends';

/**
 * Les amis, et les invitations qu'ils envoient.
 *
 * Ce contexte se contente de tenir la liste à jour et de faire sonner quand une
 * invitation arrive. Il ne sait pas ce qu'est une salle : rejoindre reste
 * l'affaire du contexte de jeu, qui parle au serveur de parties.
 */

/** Toutes les trente secondes, au cas où le temps réel ne serait pas activé. */
const RELECTURE_MS = 30_000;

interface FriendsContextType {
  lists: FriendLists;
  isLoading: boolean;
  /** Invitation la plus récente encore valable, à proposer au joueur. */
  invite: GameInvite | null;
  refresh: () => Promise<void>;
  search: (query: string) => Promise<PlayerCard[]>;
  add: (handle: string) => Promise<string | null>;
  respond: (handle: string, accept: boolean) => Promise<void>;
  remove: (handle: string) => Promise<void>;
  /** Invite un ami dans une salle déjà ouverte. Rend une erreur, ou `null`. */
  invitePlayer: (
    handle: string,
    roomId: string,
    game: 'dames' | 'morpion' | 'ludo',
  ) => Promise<string | null>;
  /** Écarte l'invitation affichée, qu'on l'accepte ou qu'on la refuse. */
  clearInvite: () => void;
}

const FriendsContext = createContext<FriendsContextType | undefined>(undefined);

export const useFriends = () => {
  const context = useContext(FriendsContext);
  if (!context) {
    throw new Error('useFriends doit être utilisé dans un FriendsProvider');
  }
  return context;
};

export const FriendsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { account } = useAccount();

  const [lists, setLists] = useState<FriendLists>(EMPTY_FRIENDS);
  const [invite, setInvite] = useState<GameInvite | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  /** Invitations déjà écartées : les relire ne doit pas les faire revenir. */
  const ecartees = useRef<Set<string>>(new Set());

  const relire = useCallback(async () => {
    if (!account) return;

    const [listes, recues] = await Promise.all([listFriends(), pendingInvites()]);
    setLists(listes);

    const vivante = recues.find((entry) => !ecartees.current.has(entry.id));
    setInvite(vivante ?? null);
  }, [account]);

  // Chargement initial, puis à chaque changement de compte.
  useEffect(() => {
    if (!account) {
      setLists(EMPTY_FRIENDS);
      setInvite(null);
      ecartees.current.clear();
      return;
    }

    let annule = false;
    setIsLoading(true);

    relire().finally(() => {
      if (!annule) setIsLoading(false);
    });

    return () => {
      annule = true;
    };
  }, [account, relire]);

  /*
   * Deux sources pour la même chose : le temps réel prévient tout de suite, la
   * relecture régulière rattrape le cas où la publication n'aurait pas été
   * activée sur le projet. Sans la seconde, une invitation pourrait n'arriver
   * jamais sans qu'on sache pourquoi.
   */
  useEffect(() => {
    if (!account) return;

    const stop = watchInvites(account.id, () => {
      void relire();
    });
    const timer = setInterval(() => void relire(), RELECTURE_MS);

    return () => {
      stop?.();
      clearInterval(timer);
    };
  }, [account, relire]);

  const search = useCallback(async (query: string) => searchPlayers(query), []);

  const add = useCallback(
    async (handle: string): Promise<string | null> => {
      const outcome = await sendFriendRequest(handle);
      if (!outcome.ok) return outcome.error;
      await relire();
      return null;
    },
    [relire],
  );

  const respond = useCallback(
    async (handle: string, accept: boolean) => {
      await respondFriendRequest(handle, accept);
      await relire();
    },
    [relire],
  );

  const remove = useCallback(
    async (handle: string) => {
      await removeRemote(handle);
      await relire();
    },
    [relire],
  );

  const invitePlayer = useCallback(
    async (handle: string, roomId: string, game: 'dames' | 'morpion' | 'ludo') => {
      const outcome = await inviteRemote(handle, roomId, game);
      return outcome.ok ? null : outcome.error;
    },
    [],
  );

  const clearInvite = useCallback(() => {
    setInvite((current) => {
      if (current) {
        // On la note écartée avant de l'effacer côté serveur : la relecture
        // suivante pourrait arriver avant la réponse.
        ecartees.current.add(current.id);
        void dismissRemote(current.id);
      }
      return null;
    });
  }, []);

  const value = useMemo<FriendsContextType>(
    () => ({
      lists,
      isLoading,
      invite,
      refresh: relire,
      search,
      add,
      respond,
      remove,
      invitePlayer,
      clearInvite,
    }),
    [lists, isLoading, invite, relire, search, add, respond, remove, invitePlayer, clearInvite],
  );

  return <FriendsContext.Provider value={value}>{children}</FriendsContext.Provider>;
};
