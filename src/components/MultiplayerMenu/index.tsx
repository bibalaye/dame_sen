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
  } = useGameContext();

  const [username, setUsername] = useState('');
  const [roomIdInput, setRoomIdInput] = useState('');
  const [view, setView] = useState<'main' | 'create' | 'join'>('main');

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
        <p>Partagez ce code avec votre adversaire pour qu&apos;il vous rejoigne.</p>
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
