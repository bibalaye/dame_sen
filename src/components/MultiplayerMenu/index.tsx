'use client';

import React, { useState, useEffect } from 'react';
import { useGameContext } from '@/context/GameContext';
import styles from './MultiplayerMenu.module.css';

const MultiplayerMenu: React.FC = () => {
  const { 
    createRoom, 
    joinRoom, 
    setMultiplayerMode, 
    isMultiplayer,
    roomId,
    opponent,
    isWaitingForOpponent,
    playerType,
    message
  } = useGameContext();

  const [username, setUsername] = useState('');
  const [roomIdInput, setRoomIdInput] = useState('');
  const [view, setView] = useState<'main' | 'create' | 'join'>('main');
  const [localRoomId, setLocalRoomId] = useState<string | null>(null);

  // Effect to track roomId changes
  useEffect(() => {
    if (roomId) {
      console.log('Room ID received in MultiplayerMenu:', roomId);
      setLocalRoomId(roomId);
    }
  }, [roomId]);

  // Handle enabling multiplayer mode
  const handleEnableMultiplayer = () => {
    setMultiplayerMode(true);
    setView('main');
  };

  // Handle disabling multiplayer mode
  const handleDisableMultiplayer = () => {
    setMultiplayerMode(false);
  };

  // Handle creating a new room
  const handleCreateRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim()) {
      console.log('Creating room with username:', username.trim());
      createRoom(username.trim());
    }
  };

  // Handle joining an existing room
  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim() && roomIdInput.trim()) {
      joinRoom(roomIdInput.trim(), username.trim());
    }
  };

  // Render waiting room view
  const renderWaitingRoom = () => {
    console.log('Rendering waiting room with roomId:', roomId || localRoomId);
    return (
      <div className={styles.waitingRoom}>
        <h3>Salle d'attente</h3>
        <p>Code de la salle: <span className={styles.roomCode}>{roomId || localRoomId}</span></p>
        <p>Partagez ce code avec votre adversaire pour qu'il puisse rejoindre la partie.</p>
        {isWaitingForOpponent ? (
          <p className={styles.waiting}>En attente d'un adversaire...</p>
        ) : (
          <p className={styles.connected}>Adversaire connecté: {opponent}</p>
        )}
        <p>Vous jouez les pièces: <span className={styles.playerType}>{playerType === 'white' ? 'Blanches' : 'Noires'}</span></p>
        <p className={styles.statusMessage}>{message}</p>
        <button 
          className={`${styles.btn} ${styles.backBtn}`}
          onClick={handleDisableMultiplayer}
        >
          Quitter la partie
        </button>
      </div>
    );
  };

  // Render create room view
  const renderCreateRoom = () => (
    <div className={styles.formContainer}>
      <h3>Créer une nouvelle partie</h3>
      <form onSubmit={handleCreateRoom}>
        <div className={styles.formGroup}>
          <label htmlFor="username">Votre nom:</label>
          <input
            type="text"
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Entrez votre nom"
            required
          />
        </div>
        <div className={styles.buttonGroup}>
          <button type="submit" className={styles.btn}>Créer la partie</button>
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

  // Render join room view
  const renderJoinRoom = () => (
    <div className={styles.formContainer}>
      <h3>Rejoindre une partie</h3>
      <form onSubmit={handleJoinRoom}>
        <div className={styles.formGroup}>
          <label htmlFor="username">Votre nom:</label>
          <input
            type="text"
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Entrez votre nom"
            required
          />
        </div>
        <div className={styles.formGroup}>
          <label htmlFor="roomId">Code de la salle:</label>
          <input
            type="text"
            id="roomId"
            value={roomIdInput}
            onChange={(e) => setRoomIdInput(e.target.value.toUpperCase())}
            placeholder="Entrez le code de la salle"
            required
          />
        </div>
        <div className={styles.buttonGroup}>
          <button type="submit" className={styles.btn}>Rejoindre</button>
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

  // Render main menu view
  const renderMainMenu = () => (
    <div className={styles.menuContainer}>
      <h3>Mode Multijoueur</h3>
      <div className={styles.buttonGroup}>
        <button 
          className={styles.btn} 
          onClick={() => setView('create')}
        >
          Créer une partie
        </button>
        <button 
          className={styles.btn} 
          onClick={() => setView('join')}
        >
          Rejoindre une partie
        </button>
        <button 
          className={`${styles.btn} ${styles.backBtn}`} 
          onClick={handleDisableMultiplayer}
        >
          Retour au mode solo
        </button>
      </div>
    </div>
  );

  // If not in multiplayer mode, show enable button
  if (!isMultiplayer) {
    return (
      <div className={styles.container}>
        <button 
          className={`${styles.btn} ${styles.multiplayerBtn}`}
          onClick={handleEnableMultiplayer}
        >
          Mode Multijoueur
        </button>
      </div>
    );
  }

  // If in a room, show waiting room
  if (roomId || localRoomId) {
    return renderWaitingRoom();
  }

  // Otherwise show appropriate view based on state
  switch (view) {
    case 'create':
      return renderCreateRoom();
    case 'join':
      return renderJoinRoom();
    default:
      return renderMainMenu();
  }
};

export default MultiplayerMenu;