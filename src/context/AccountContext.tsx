'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { checkHandle, checkPassword, type Account } from '@/lib/account';
import {
  EMPTY_PROFILE,
  hasLocalProgress,
  mergeProfiles,
  summarizeImport,
  type PlayerProfile,
} from '@/lib/profile';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import {
  importLocalProgress,
  loadRemoteState,
  signIn as remoteSignIn,
  signOut as remoteSignOut,
  signUp as remoteSignUp,
} from '@/lib/supabase/remote';

/**
 * L'identité du joueur.
 *
 * Ce contexte ne sait rien des règles ni des plateaux : il répond à une seule
 * question — qui joue, et le serveur connaît-il sa progression. Le reste de
 * l'application s'en sert pour choisir où écrire, sans avoir à connaître
 * Supabase.
 *
 * Jouer sans compte reste le cas normal : tant que personne ne s'est connecté,
 * `account` vaut `null` et rien ne part sur le réseau.
 */

/** Ce que la connexion rapporte : le profil du serveur, à fusionner. */
export interface SignedIn {
  readonly account: Account;
  readonly profile: PlayerProfile;
  /** Progression locale reprise à l'inscription, s'il y en avait une. */
  readonly imported?: { readonly stars: number; readonly games: number };
}

interface AccountContextType {
  /** Vrai si le projet dispose d'un serveur de comptes. */
  isConfigured: boolean;
  /** Vrai tant que la session en cours n'a pas été vérifiée. */
  isLoading: boolean;
  /** Vrai pendant une inscription ou une connexion. */
  isWorking: boolean;
  account: Account | null;
  error: string | null;
  clearError: () => void;
  /**
   * Crée un compte. La progression de l'appareil est reprise si le joueur le
   * demande — une seule fois, à l'inscription.
   */
  signUp: (handle: string, password: string, takeLocal: boolean) => Promise<boolean>;
  signIn: (handle: string, password: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  /**
   * Profil du serveur au dernier chargement, déjà fusionné avec ce que
   * l'appareil savait. `null` hors connexion.
   */
  remoteProfile: PlayerProfile | null;
  /** Recharge le profil depuis le serveur. */
  refresh: () => Promise<PlayerProfile | null>;
  /**
   * Renseigné par le jeu : ce que l'appareil contient, pour la fusion à la
   * connexion et la reprise à l'inscription.
   */
  provideLocalProfile: (profile: PlayerProfile) => void;
  /** Vrai si l'appareil a une progression que le joueur risque de perdre. */
  hasProgressToKeep: boolean;
}

const AccountContext = createContext<AccountContextType | undefined>(undefined);

export const useAccount = () => {
  const context = useContext(AccountContext);
  if (!context) {
    throw new Error('useAccount doit être utilisé dans un AccountProvider');
  }
  return context;
};

export const AccountProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [account, setAccount] = useState<Account | null>(null);
  const [remoteProfile, setRemoteProfile] = useState<PlayerProfile | null>(null);
  const [isLoading, setIsLoading] = useState(isSupabaseConfigured);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Ce que l'appareil détient. Conservé dans un état plutôt que lu à la
   * demande : la fusion doit voir la progression telle qu'elle était avant
   * l'arrivée du compte.
   */
  const [localProfile, setLocalProfile] = useState<PlayerProfile>(EMPTY_PROFILE);

  const provideLocalProfile = useCallback((profile: PlayerProfile) => {
    setLocalProfile(profile);
  }, []);

  // Reprise de la session au démarrage. Sans serveur configuré, il n'y a rien
  // à vérifier et l'écran ne doit pas attendre.
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    loadRemoteState()
      .then((state) => {
        if (cancelled || !state) return;
        setAccount(state.account);
        setRemoteProfile(state.profile);
      })
      .catch((cause) => console.error('[compte] session illisible', cause))
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(async (): Promise<PlayerProfile | null> => {
    const state = await loadRemoteState();
    if (!state) return null;

    setAccount(state.account);
    setRemoteProfile(state.profile);
    return state.profile;
  }, []);

  const signUp = useCallback(
    async (handle: string, password: string, takeLocal: boolean): Promise<boolean> => {
      const handleCheck = checkHandle(handle);
      if (!handleCheck.ok) {
        setError(handleCheck.reason);
        return false;
      }
      const passwordCheck = checkPassword(password);
      if (!passwordCheck.ok) {
        setError(passwordCheck.reason);
        return false;
      }

      setIsWorking(true);
      setError(null);

      try {
        const outcome = await remoteSignUp(handle, password);
        if (!outcome.ok) {
          setError(outcome.error);
          return false;
        }

        setAccount(outcome.value.account);

        // La reprise n'a lieu qu'ici : un compte déjà créé ne réabsorbe jamais
        // le contenu d'un navigateur.
        if (takeLocal && hasLocalProgress(localProfile)) {
          const resume = summarizeImport(localProfile);
          await importLocalProgress(resume.coins, localProfile.history);

          const fresh = await refresh();
          setRemoteProfile(fresh ?? outcome.value.profile);
          return true;
        }

        setRemoteProfile(outcome.value.profile);
        return true;
      } catch (cause) {
        console.error('[compte] inscription', cause);
        setError('La création du compte a échoué.');
        return false;
      } finally {
        setIsWorking(false);
      }
    },
    [localProfile, refresh],
  );

  const signIn = useCallback(
    async (handle: string, password: string): Promise<boolean> => {
      if (handle.trim().length === 0 || password.length === 0) {
        setError('Entrez votre pseudo et votre mot de passe.');
        return false;
      }

      setIsWorking(true);
      setError(null);

      try {
        const outcome = await remoteSignIn(handle, password);
        if (!outcome.ok) {
          setError(outcome.error);
          return false;
        }

        setAccount(outcome.value.account);
        // Les parties jouées hors compte sur cet appareil rejoignent celles du
        // compte : se connecter ne doit jamais faire disparaître une partie.
        setRemoteProfile(mergeProfiles(localProfile, outcome.value.profile));
        return true;
      } catch (cause) {
        console.error('[compte] connexion', cause);
        setError('La connexion a échoué.');
        return false;
      } finally {
        setIsWorking(false);
      }
    },
    [localProfile],
  );

  const signOut = useCallback(async () => {
    await remoteSignOut();
    setAccount(null);
    setRemoteProfile(null);
  }, []);

  const value = useMemo<AccountContextType>(
    () => ({
      isConfigured: isSupabaseConfigured,
      isLoading,
      isWorking,
      account,
      error,
      clearError: () => setError(null),
      signUp,
      signIn,
      signOut,
      remoteProfile,
      refresh,
      provideLocalProfile,
      hasProgressToKeep: hasLocalProgress(localProfile),
    }),
    [
      isLoading,
      isWorking,
      account,
      error,
      signUp,
      signIn,
      signOut,
      remoteProfile,
      refresh,
      provideLocalProfile,
      localProfile,
    ],
  );

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
};
