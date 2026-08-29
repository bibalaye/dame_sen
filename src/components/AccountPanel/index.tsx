'use client';

import React, { useState } from 'react';

import Modal from '../Modal';
import Leaderboard from '../Leaderboard';
import AuthForm from '../AuthForm';
import { useAccount } from '@/context/AccountContext';
import { useGameContext } from '@/context/GameContext';
import { computeStats } from '@/lib/history';
import { formatCoins } from '@/lib/economy';
import { findFrame, findTitle } from '@/lib/shop';
import styles from './AccountPanel.module.css';

interface AccountPanelProps {
  onClose: () => void;
}

/**
 * Le compte du joueur.
 *
 * Deux états seulement : on est connecté et on voit sa progression, ou on ne
 * l'est pas et on voit un formulaire. Rien n'y est obligatoire — le jeu se
 * joue entier sans compte, et cette fenêtre ne s'ouvre que si on la demande.
 */
const AccountPanel: React.FC<AccountPanelProps> = ({ onClose }) => {
  const { isConfigured, account, signOut } = useAccount();
  const { wallet, history, loadout } = useGameContext();

  // Le classement remplace le panneau au lieu de s'y superposer : deux voiles
  // empilés donnent une pile de fenêtres dont on ne sait plus comment sortir.
  const [boardOpen, setBoardOpen] = useState(false);

  const stats = computeStats(history);
  const cadre = findFrame(loadout.frame);
  const titre = findTitle(loadout.title);

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

  return (
    <Modal title="Se connecter" onClose={onClose}>
      <AuthForm onDone={onClose} />
    </Modal>
  );
};

export default AccountPanel;
