'use client';

import React from 'react';

import { useAccount } from '@/context/AccountContext';
import { useFriends } from '@/context/FriendsContext';
import { useGameContext } from '@/context/GameContext';
import { play } from '@/lib/sound';
import styles from './InviteBanner.module.css';

/**
 * L'invitation d'un ami, quand elle arrive.
 *
 * Elle se pose au-dessus de l'écran plutôt que dans une fenêtre modale : on
 * peut la laisser là et finir ce qu'on faisait. Une invitation n'est pas une
 * urgence, et couper une partie en cours pour l'annoncer serait pire que de ne
 * pas l'annoncer du tout.
 */
const InviteBanner: React.FC = () => {
  const { invite, clearInvite } = useFriends();
  const { account } = useAccount();
  const { joinRoom, startGame, roomId } = useGameContext();

  // Déjà dans une salle : on ne propose pas d'en rejoindre une autre par
  // surprise, au risque d'abandonner la partie en cours d'un geste.
  if (!invite || roomId) return null;

  const rejoindre = () => {
    play('select');
    const nom = account?.displayName ?? 'Joueur';

    startGame({ kind: invite.game, mode: 'online' });
    joinRoom(invite.roomId, nom);
    clearInvite();
  };

  return (
    <div className={styles.banner} role="alert">
      <div className={styles.text}>
        <p className={styles.who}>
          <strong>{invite.displayName}</strong> vous invite
        </p>
        <p className={styles.what}>
          {invite.game === 'dames' ? 'Une partie de dames' : 'Une partie de morpion'}
        </p>
      </div>

      <div className={styles.actions}>
        <button type="button" className={`uiButton ${styles.join}`} onClick={rejoindre}>
          Rejoindre
        </button>
        <button
          type="button"
          className={`uiButton uiButtonNeutral ${styles.later}`}
          onClick={clearInvite}
        >
          Plus tard
        </button>
      </div>
    </div>
  );
};

export default InviteBanner;
