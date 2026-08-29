'use client';

import React, { useEffect, useState } from 'react';

import { useAccount } from '@/context/AccountContext';
import { HANDLE_MAX } from '@/lib/account';
import styles from './AuthForm.module.css';

interface AuthFormProps {
  /** Appelé une fois la connexion ou l'inscription réussie. */
  onDone?: () => void;
}

type Tab = 'signin' | 'signup';

/**
 * Le formulaire d'entrée : pseudo et mot de passe.
 *
 * Il sert à deux endroits — la porte d'entrée du jeu, et la fenêtre « compte »
 * pour qui se reconnecte. Le dupliquer aurait fait diverger deux formulaires
 * qui doivent poser exactement les mêmes questions.
 */
const AuthForm: React.FC<AuthFormProps> = ({ onDone }) => {
  const { isWorking, error, clearError, signIn, signUp, hasProgressToKeep } = useAccount();

  // Un joueur qui arrive pour la première fois n'a pas de compte : c'est
  // l'inscription qu'il faut lui présenter, pas un formulaire de connexion.
  const [tab, setTab] = useState<Tab>('signup');
  const [handle, setHandle] = useState('');
  const [password, setPassword] = useState('');
  const [takeLocal, setTakeLocal] = useState(true);

  // Changer d'onglet efface le reproche fait à la tentative précédente.
  useEffect(() => {
    clearError();
  }, [tab, clearError]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const done =
      tab === 'signin'
        ? await signIn(handle, password)
        : await signUp(handle, password, takeLocal);

    if (done) onDone?.();
  };

  return (
    <>
      <div className={styles.tabs} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'signup'}
          className={`${styles.tab} ${tab === 'signup' ? styles.tabOn : ''}`}
          onClick={() => setTab('signup')}
        >
          Nouveau joueur
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'signin'}
          className={`${styles.tab} ${tab === 'signin' ? styles.tabOn : ''}`}
          onClick={() => setTab('signin')}
        >
          J’ai un compte
        </button>
      </div>

      <form onSubmit={submit}>
        <div className={styles.field}>
          <label htmlFor="compte-pseudo">Pseudo</label>
          <input
            id="compte-pseudo"
            className="uiInput"
            value={handle}
            onChange={(event) => setHandle(event.target.value)}
            maxLength={HANDLE_MAX}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="Votre nom de joueur"
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="compte-mdp">Mot de passe</label>
          <input
            id="compte-mdp"
            className="uiInput"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={tab === 'signin' ? 'current-password' : 'new-password'}
            placeholder="Au moins 6 caractères"
          />
        </div>

        {tab === 'signup' && hasProgressToKeep && (
          <label className={styles.keep}>
            <input
              type="checkbox"
              checked={takeLocal}
              onChange={(event) => setTakeLocal(event.target.checked)}
            />
            <span>
              Reprendre la progression de cet appareil — vos parties et vos
              cauris rejoignent le nouveau compte.
            </span>
          </label>
        )}

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        <button type="submit" className={`uiButton ${styles.action}`} disabled={isWorking}>
          {isWorking
            ? 'Un instant…'
            : tab === 'signin'
              ? 'Se connecter'
              : 'Créer mon compte'}
        </button>
      </form>

      <p className={styles.note}>
        {tab === 'signup'
          ? 'Aucune adresse électronique demandée. Notez bien votre mot de passe : sans adresse, il ne peut pas être réinitialisé.'
          : 'Entrez le pseudo et le mot de passe choisis à l’inscription.'}
      </p>
    </>
  );
};

export default AuthForm;
