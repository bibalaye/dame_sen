'use client';

import React, { useState } from 'react';
import { useGameContext } from '@/context/GameContext';
import styles from './MultiplayerMenu.module.css';

const MultiplayerMenu: React.FC = () => {
  const {
    createRoom,
    joinRoom,
    goHome,
    roomId,
    opponent,
    isWaitingForOpponent,
    playerType,
    invitedRoom,
  } = useGameContext();

  const [username, setUsername] = useState('');
  const [roomIdInput, setRoomIdInput] = useState(invitedRoom ?? '');
  const [view, setView] = useState<'main' | 'create' | 'join'>(
    invitedRoom ? 'join' : 'main',
  );
  const [copied, setCopied] = useState(false);

  /** Le lien complet à envoyer : le destinataire arrive dans la salle. */
  const inviteLink = () =>
    typeof window === 'undefined'
      ? ''
      : `${window.location.origin}${window.location.pathname}?partie=${roomId}`;

  const handleInvite = async () => {
    const url = inviteLink();
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Dames sénégalaises',
          text: 'Une partie ?',
          url,
        });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // Partage refusé : le code reste affiché, dictable à l'ancienne.
      setCopied(false);
    }
  };

  const handleCreateRoom = (event: React.FormEvent) => {
    event.preventDefault();
    if (username.trim()) createRoom(username.trim());
  };

  const handleJoinRoom = (event: React.FormEvent) => {
    event.preventDefault();
    if (username.trim() && roomIdInput.trim()) {
      joinRoom(roomIdInput.trim(), username.trim());
    }
  };

  if (roomId) {
    return (
      <div className={styles.waitingRoom}>
        <h3>Salle d&apos;attente</h3>
        <p>
          Code de la salle :{' '}
          <span className={styles.roomCode}>{roomId}</span>
        </p>
        <button type="button" className={styles.btn} onClick={handleInvite}>
          {copied ? 'Lien copié !' : 'Inviter par lien'}
        </button>
        <p className={styles.hint}>
          Le lien ouvre la partie directement — plus besoin de dicter le code.
        </p>
        {isWaitingForOpponent ? (
          <p className={styles.waiting}>En attente d&apos;un adversaire…</p>
        ) : (
          <p className={styles.connected}>Adversaire connecté : {opponent}</p>
        )}
        <p>
          Vous jouez les pièces{' '}
          <span className={styles.playerType}>
            {playerType === 'white' ? 'blanches' : 'noires'}
          </span>
        </p>
        <button
          type="button"
          className={`${styles.btn} ${styles.backBtn}`}
          onClick={goHome}
        >
          Quitter la partie
        </button>
      </div>
    );
  }

  if (view === 'create' || view === 'join') {
    const isJoining = view === 'join';

    return (
      <div className={styles.formContainer}>
        <h3>{isJoining ? 'Rejoindre une partie' : 'Créer une nouvelle partie'}</h3>
        <form onSubmit={isJoining ? handleJoinRoom : handleCreateRoom}>
          <div className={styles.formGroup}>
            <label htmlFor="username">Votre nom</label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Entrez votre nom"
              required
            />
          </div>

          {isJoining && (
            <div className={styles.formGroup}>
              <label htmlFor="roomId">Code de la salle</label>
              <input
                type="text"
                id="roomId"
                value={roomIdInput}
                onChange={(event) => setRoomIdInput(event.target.value.toUpperCase())}
                placeholder="Entrez le code"
                required
              />
            </div>
          )}

          <div className={styles.buttonGroup}>
            <button type="submit" className={styles.btn}>
              {isJoining ? 'Rejoindre' : 'Créer la partie'}
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.backBtn}`}
              onClick={() => setView('main')}
            >
              Retour
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className={styles.menuContainer}>
      <h3>Jouer à distance</h3>
      <div className={styles.buttonGroup}>
        <button type="button" className={styles.btn} onClick={() => setView('create')}>
          Créer une partie
        </button>
        <button type="button" className={styles.btn} onClick={() => setView('join')}>
          Rejoindre une partie
        </button>
      </div>
    </div>
  );
};

export default MultiplayerMenu;
