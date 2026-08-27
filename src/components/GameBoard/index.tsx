'use client';

import React, { useState } from 'react';
import Board from '../Board';
import ClockDisplay from '../ClockDisplay';
import ComboBanner from '../ComboBanner';
import GameOverAnimation from '../GameOverAnimation';
import MultiplayerMenu from '../MultiplayerMenu';
import RulesPanel from '../RulesPanel';
import { OPPONENTS } from '../HomeScreen';
import { useGameContext } from '@/context/GameContext';
import styles from './GameBoard.module.css';

const GameBoard = () => {
  const {
    mode,
    currentPlayer,
    whitePieces,
    blackPieces,
    message,
    gameOver,
    winner,
    status,
    chainLength,
    isThinking,
    hintsLeft,
    difficulty,
    clock,
    muted,
    isFlipped,
    requestHint,
    resetGame,
    goHome,
    toggleMute,
  } = useGameContext();

  const [showRules, setShowRules] = useState(false);

  const opponent = OPPONENTS.find((entry) => entry.id === difficulty);
  const isDraw = status.kind === 'draw';

  const blackName =
    mode === 'solo' ? (opponent?.name ?? 'Noirs') : 'Noirs';
  const whiteName = mode === 'solo' ? 'Vous' : 'Blancs';

  // En mode « autour du plateau », le panneau du joueur au trait passe devant.
  const panels = [
    { player: 'white' as const, name: whiteName, count: whitePieces },
    { player: 'black' as const, name: blackName, count: blackPieces },
  ];
  const ordered = isFlipped ? [...panels].reverse() : panels;

  return (
    <div className={styles.container}>
      <header className={styles.topBar}>
        <button type="button" className={styles.iconBtn} onClick={goHome}>
          ← Accueil
        </button>
        <h1 className={styles.title}>Dames sénégalaises</h1>
        <button
          type="button"
          className={styles.iconBtn}
          onClick={toggleMute}
          aria-pressed={muted}
          aria-label={muted ? 'Activer le son' : 'Couper le son'}
        >
          {muted ? 'Son coupé' : 'Son actif'}
        </button>
      </header>

      <div className={styles.stage}>
        <Board />
        <ComboBanner chainLength={chainLength} />
      </div>

      <div className={styles.infoPanel}>
        {ordered.map((panel) => (
          <div
            key={panel.player}
            className={[
              styles.playerInfo,
              panel.player === 'white' ? styles.whitePlayer : styles.blackPlayer,
              currentPlayer === panel.player ? styles.activePlayer : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <span className={styles.playerName}>{panel.name}</span>
            <span className={styles.pieceCount}>{panel.count}</span>
            <ClockDisplay
              clock={clock}
              player={panel.player}
              isRunning={clock.running === panel.player}
            />
          </div>
        ))}
      </div>

      <div
        className={`${styles.message} ${isThinking ? styles.thinking : ''}`}
        role="status"
        aria-live="polite"
      >
        {message}
      </div>

      <div className={styles.buttons}>
        <button
          type="button"
          className={`${styles.btn} ${styles.resetBtn}`}
          onClick={resetGame}
        >
          Nouvelle partie
        </button>
        {mode === 'solo' && (
          <button
            type="button"
            className={styles.btn}
            onClick={requestHint}
            disabled={gameOver || hintsLeft === 0 || currentPlayer !== 'white'}
          >
            Un conseil ? ({hintsLeft})
          </button>
        )}
        <button
          type="button"
          className={styles.btn}
          onClick={() => setShowRules(true)}
        >
          Règles
        </button>
      </div>

      {mode === 'online' && (
        <div className={styles.multiplayerSection}>
          <MultiplayerMenu />
        </div>
      )}

      <GameOverAnimation
        winner={winner}
        isDraw={isDraw}
        isVisible={gameOver}
        mode={mode}
        onRematch={resetGame}
        onHome={goHome}
      />

      {showRules && <RulesPanel onClose={() => setShowRules(false)} />}
    </div>
  );
};

export default GameBoard;
