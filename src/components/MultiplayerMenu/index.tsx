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
    isConnecting,
    connectionError,
    startGame,
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

  const status = connectionError ? (
    <div className={styles.error} role="alert">
      <p className={styles.errorText}>{connectionError}</p>
      <div className={styles.errorActions}>
        <button
          type="button"
          className={`${styles.btn} ${styles.backBtn}`}
          onClick={() => startGame({ kind: 'morpion', mode: 'pass' })}
        >
          Jouer à deux ici
        </button>
        <button
          type="button"
          className={`${styles.btn} ${styles.backBtn}`}
          onClick={goHome}
        >
          Accueil
        </button>
      </div>
    </div>
  ) : isConnecting ? (
    <p className={styles.connecting}>Connexion au serveur de jeu…</p>
  ) : null;

  if (roomId) {
    return (
      <div className={styles.waitingRoom}>
        {status}
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
        {status}
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
            <button type="submit" className={styles.btn} disabled={!!connectionError}>
              {isConnecting
                ? 'Connexion…'
                : isJoining
                  ? 'Rejoindre'
                  : 'Créer la partie'}
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
      {status}
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
