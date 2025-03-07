'use client';

import React from 'react';
import Board from '../Board';
import { useGameContext } from '@/context/GameContext';
import GameOverAnimation from '../GameOverAnimation';
import MultiplayerMenu from '../MultiplayerMenu';
import styles from './GameBoard.module.css';

const GameBoard = () => {
  const { 
    currentPlayer, 
    whitePieces, 
    blackPieces, 
    message, 
    gameOver,
    resetGame 
  } = useGameContext();

  // Determine the winner based on the game state
  const winner = gameOver ? (whitePieces === 0 ? 'black' : blackPieces === 0 ? 'white' : message.includes('Blanc gagne') ? 'white' : 'black') : null;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>Jeu de Dames à la Sénégalaise</h1>
        <p className={styles.subtitle}>Le jeu traditionnel du Sénégal</p>
      </header>

      <div className={styles.gameContainer}>
        <div className={styles.boardWrapper}>
          <Board />
        </div>

        <div className={styles.infoPanel}>
          <div 
            className={`${styles.playerInfo} ${styles.whitePlayer} ${currentPlayer === 'white' ? styles.activePlayer : ''}`}
          >
            Joueur Blanc: {whitePieces}
          </div>
          <div 
            className={`${styles.playerInfo} ${styles.blackPlayer} ${currentPlayer === 'black' ? styles.activePlayer : ''}`}
          >
            Joueur Noir: {blackPieces}
          </div>
        </div>

        <div className={styles.controls}>
          <div className={styles.message}>{message}</div>
          
          <div className={styles.buttons}>
            <button 
              className={`${styles.btn} ${styles.resetBtn}`} 
              onClick={resetGame}
            >
              Nouvelle Partie
            </button>
            <button 
              className={`${styles.btn} ${styles.helpBtn}`}
              onClick={() => alert('Règles du jeu de dames à la sénégalaise:\n\n- Le plateau est de 5x5\n- Les pièces se déplacent orthogonalement (horizontalement et verticalement)\n- Les captures sont obligatoires\n- Une pièce devient dame en atteignant la dernière rangée adverse\n- Les dames peuvent se déplacer de plusieurs cases')}
            >
              Règles du jeu
            </button>
          </div>
        </div>
      </div>

      <div className={styles.multiplayerSection}>
        <MultiplayerMenu />
      </div>

      <footer className={styles.footer}>
        <p>© 2025 - Jeu de Dames à la Sénégalaise</p>
      </footer>

      {/* Game over animation */}
      <GameOverAnimation winner={winner} isVisible={gameOver} />
    </div>
  );
};

export default GameBoard;