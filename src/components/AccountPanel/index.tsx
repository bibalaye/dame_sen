'use client';

import React, { useEffect, useState } from 'react';

import Modal from '../Modal';
import Leaderboard from '../Leaderboard';
import { useAccount } from '@/context/AccountContext';
import { useGameContext } from '@/context/GameContext';
import { computeStats } from '@/lib/history';
import { formatCoins } from '@/lib/economy';
import { findFrame, findTitle } from '@/lib/shop';
import { HANDLE_MAX } from '@/lib/account';
import styles from './AccountPanel.module.css';

interface AccountPanelProps {
  onClose: () => void;
}

type Tab = 'signin' | 'signup';

/**
 * Le compte du joueur.
 *
 * Deux états seulement : on est connecté et on voit sa progression, ou on ne
 * l'est pas et on voit un formulaire. Rien n'y est obligatoire — le jeu se
 * joue entier sans compte, et cette fenêtre ne s'ouvre que si on la demande.
 */
const AccountPanel: React.FC<AccountPanelProps> = ({ onClose }) => {
  const {
    isConfigured,
    isWorking,
    account,
    error,
    clearError,
    signIn,
    signUp,
    signOut,
    hasProgressToKeep,
  } = useAccount();
  const { wallet, history, loadout } = useGameContext();

  const [tab, setTab] = useState<Tab>('signin');
  const [handle, setHandle] = useState('');
  const [password, setPassword] = useState('');
  const [takeLocal, setTakeLocal] = useState(true);
  // Le classement remplace le panneau au lieu de s'y superposer : deux voiles
  // empilés donnent une pile de fenêtres dont on ne sait plus comment sortir.
  const [boardOpen, setBoardOpen] = useState(false);

  const stats = computeStats(history);
  const cadre = findFrame(loadout.frame);
  const titre = findTitle(loadout.title);

  // Changer d'onglet efface le reproche fait à la tentative précédente.
  useEffect(() => {
    clearError();
  }, [tab, clearError]);

  if (!isConfigured) {
    return (
      <Modal title="Compte" onClose={onClose}>
        <p className={styles.lead}>
          Les comptes ne sont pas encore activés sur cette installation. Votre
          progression est conservée sur cet appareil : elle reste intacte tant
          que vous ne videz pas les données du navigateur.
        </p>
      </Modal>
    );
  }

  if (boardOpen) {
    return <Leaderboard onClose={() => setBoardOpen(false)} />;
  }

  if (account) {
    return (
      <Modal title="Mon compte" onClose={onClose}>
        <div className={styles.identity}>
          {/* Le cadre acheté se voit ici et sur le classement : c'est tout
              l'intérêt d'en posséder un. */}
          <span
            className={styles.avatar}
            style={cadre ? { borderColor: cadre.color } : undefined}
            aria-hidden="true"
          >
            {account.displayName.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <p className={styles.name}>{account.displayName}</p>
            {titre ? (
              <p className={styles.playerTitle}>{titre.label}</p>
            ) : (
              <p className={styles.handle}>@{account.handle}</p>
            )}
          </div>
        </div>

        <ul className={styles.stats}>
          <li>
            <span className={styles.figure}>{formatCoins(wallet.coins)}</span>
            <span className={styles.label}>cauris</span>
          </li>
          <li>
            <span className={styles.figure}>{stats.played}</span>
            <span className={styles.label}>parties</span>
          </li>
          <li>
            <span className={styles.figure}>{stats.wins}</span>
            <span className={styles.label}>victoires</span>
          </li>
          <li>
            <span className={styles.figure}>{stats.bestStreak}</span>
            <span className={styles.label}>record</span>
          </li>
        </ul>

        <p className={styles.note}>
          Votre progression suit ce compte : retrouvez-la sur n’importe quel
          appareil en vous connectant avec le même pseudo.
        </p>

        <button
          type="button"
          className={`uiButton ${styles.action}`}
          onClick={() => setBoardOpen(true)}
        >
          Voir le classement
        </button>

        <button
          type="button"
          className={`uiButton uiButtonNeutral ${styles.action}`}
          onClick={() => {
            void signOut().then(onClose);
          }}
        >
          Se déconnecter
        </button>
      </Modal>
    );
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const done =
      tab === 'signin'
        ? await signIn(handle, password)
        : await signUp(handle, password, takeLocal);

    if (done) onClose();
  };

  return (
    <Modal title={tab === 'signin' ? 'Se connecter' : 'Créer un compte'} onClose={onClose}>
      <div className={styles.tabs} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'signin'}
          className={`${styles.tab} ${tab === 'signin' ? styles.tabOn : ''}`}
          onClick={() => setTab('signin')}
        >
          J’ai un compte
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'signup'}
          className={`${styles.tab} ${tab === 'signup' ? styles.tabOn : ''}`}
          onClick={() => setTab('signup')}
        >
          Nouveau joueur
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

        <button
          type="submit"
          className={`uiButton ${styles.action}`}
          disabled={isWorking}
        >
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
          : 'Un compte sert à retrouver ses cauris et son historique sur un autre appareil. Jouer n’en demande pas.'}
      </p>
    </Modal>
  );
};

export default AccountPanel;
