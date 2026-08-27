'use client';

import React, { useState } from 'react';
import Board from '../Board';
import { useGameContext } from '@/context/GameContext';
import GameOverAnimation from '../GameOverAnimation';
import MultiplayerMenu from '../MultiplayerMenu';
import RulesPanel from '../RulesPanel';
import type { Difficulty } from '@/lib/ai';
import styles from './GameBoard.module.css';

/**
 * Les quatre adversaires. Un niveau qui porte un nom se raconte : « j'ai battu
 * le vieux » veut dire quelque chose, « j'ai battu le niveau 4 » non.
 */
const OPPONENTS: ReadonlyArray<{
  id: Difficulty;
  name: string;
  tagline: string;
}> = [
  { id: 'easy', name: 'Le neveu', tagline: 'Joue vite, réfléchit peu' },
  { id: 'medium', name: 'La marchande', tagline: 'Ne rate jamais une prise' },
  { id: 'hard', name: 'Le tonton', tagline: 'Voit venir les rafles' },
  { id: 'expert', name: 'Le vieux', tagline: 'Sous le manguier depuis 40 ans' },
];

const GameBoard = () => {
  const {
    currentPlayer,
    whitePieces,
    blackPieces,
    message,
    gameOver,
    winner,
    status,
    isThinking,
    hintsLeft,
    difficulty,
    setDifficulty,
    requestHint,
    resetGame,
    isMultiplayer,
  } = useGameContext();

  const [showRules, setShowRules] = useState(false);

  const opponent = OPPONENTS.find((entry) => entry.id === difficulty);
  const isDraw = status.kind === 'draw';

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
            className={`${styles.playerInfo} ${styles.whitePlayer} ${
              currentPlayer === 'white' ? styles.activePlayer : ''
            }`}
          >
            <span className={styles.playerName}>
              {isMultiplayer ? 'Blancs' : 'Vous'}
            </span>
            <span className={styles.pieceCount}>{whitePieces}</span>
          </div>
          <div
            className={`${styles.playerInfo} ${styles.blackPlayer} ${
              currentPlayer === 'black' ? styles.activePlayer : ''
            }`}
          >
            <span className={styles.playerName}>
              {isMultiplayer ? 'Noirs' : (opponent?.name ?? 'Noirs')}
            </span>
            <span className={styles.pieceCount}>{blackPieces}</span>
          </div>
        </div>

        <div className={styles.controls}>
          <div
            className={`${styles.message} ${isThinking ? styles.thinking : ''}`}
            role="status"
            aria-live="polite"
          >
            {message}
          </div>

          {!isMultiplayer && (
            <fieldset className={styles.opponents}>
              <legend className={styles.opponentsLegend}>Votre adversaire</legend>
              <div className={styles.opponentList}>
                {OPPONENTS.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className={`${styles.opponentBtn} ${
                      difficulty === entry.id ? styles.opponentActive : ''
                    }`}
                    onClick={() => setDifficulty(entry.id)}
                    aria-pressed={difficulty === entry.id}
                    title={entry.tagline}
                  >
                    {entry.name}
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          <div className={styles.buttons}>
            <button
              className={`${styles.btn} ${styles.resetBtn}`}
              onClick={resetGame}
            >
              Nouvelle partie
            </button>
            {!isMultiplayer && (
              <button
                className={`${styles.btn} ${styles.hintBtn}`}
                onClick={requestHint}
                disabled={gameOver || hintsLeft === 0 || currentPlayer !== 'white'}
              >
                Un conseil ? ({hintsLeft})
              </button>
            )}
            <button
              className={`${styles.btn} ${styles.helpBtn}`}
              onClick={() => setShowRules(true)}
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

      <GameOverAnimation
        winner={winner}
        isDraw={isDraw}
        isVisible={gameOver}
        onRematch={resetGame}
      />

      {showRules && <RulesPanel onClose={() => setShowRules(false)} />}
    </div>
  );
};

export default GameBoard;
