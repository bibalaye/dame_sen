'use client';

import React, { useState } from 'react';
import Board from '../Board';
import ComboBanner from '../ComboBanner';
import DailyPanel from '../DailyPanel';
import GameOverAnimation from '../GameOverAnimation';
import Modal from '../Modal';
import MultiplayerMenu from '../MultiplayerMenu';
import PlayerBar from '../PlayerBar';
import RulesPanel from '../RulesPanel';
import Toast from '../Toast';
import { OPPONENTS } from '../HomeScreen';
import { useGameContext } from '@/context/GameContext';
import styles from './GameBoard.module.css';

type Sheet = 'menu' | 'rules' | 'room' | null;

const GameBoard = () => {
  const {
    mode,
    currentPlayer,
    whitePieces,
    blackPieces,
    alert,
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
    roomId,
    opponent,
    isWaitingForOpponent,
    daily,
    series,
    bestChain,
    requestHint,
    resetGame,
    goHome,
    toggleMute,
    shareResult,
  } = useGameContext();

  const [sheet, setSheet] = useState<Sheet>(null);
  /** Écran de fin refermé : le joueur veut revoir la position. */
  const [resultHidden, setResultHidden] = useState(false);

  const character = OPPONENTS.find((entry) => entry.id === difficulty);
  const startingPieces = mode === 'daily' ? Math.max(whitePieces, blackPieces, 1) : 12;

  const names =
    mode === 'solo'
      ? { white: 'Vous', black: character?.name ?? 'Noirs' }
      : mode === 'online'
        ? { white: 'Blancs', black: opponent ?? 'Noirs' }
        : { white: 'Blancs', black: 'Noirs' };

  const subtitles: Record<'white' | 'black', string | undefined> =
    mode === 'solo'
      ? { white: undefined, black: character?.tagline }
      : mode === 'daily' && daily
        ? {
            white: `${daily.attempts.length + 1}ᵉ essai sur ${3}`,
            black: `objectif : ${daily.puzzle.target} prises`,
          }
        : { white: undefined, black: undefined };

  // L'adversaire est en haut, le joueur en bas — comme autour d'une table.
  const top = isFlipped ? 'white' : 'black';
  const bottom = isFlipped ? 'black' : 'white';
  const pieces = { white: whitePieces, black: blackPieces } as const;

  // La salle d'attente s'impose tant que personne n'est en face ; dès que
  // l'adversaire arrive, elle disparaît et laisse le plateau seul à l'écran.
  const roomPending = mode === 'online' && (!roomId || isWaitingForOpponent);
  const showRoom = sheet === 'room' || roomPending;

  return (
    <div className={styles.screen}>
      <header className={styles.hud}>
        <button
          type="button"
          className={styles.hudBtn}
          onClick={goHome}
          aria-label="Retour à l’accueil"
        >
          ←
        </button>

        <span className={styles.hudTitle}>
          {mode === 'daily' && daily
            ? `Défi n°${daily.puzzle.number}`
            : mode === 'online'
              ? 'Partie en ligne'
              : mode === 'pass'
                ? 'Autour du plateau'
                : 'Partie solo'}
        </span>

        <button
          type="button"
          className={styles.hudBtn}
          onClick={() => setSheet('menu')}
          aria-label="Menu de la partie"
        >
          ⋯
        </button>
      </header>

      <main className={styles.table}>
        <PlayerBar
          side={top}
          name={names[top]}
          subtitle={subtitles[top]}
          pieces={pieces[top]}
          total={startingPieces}
          isActive={currentPlayer === top && !gameOver}
          isThinking={isThinking && top === 'black'}
          clock={clock}
        />

        <div className={styles.stage}>
          <Toast message={alert ?? ''} mute={gameOver} />
          <Board />
          <ComboBanner chainLength={chainLength} />
        </div>

        <PlayerBar
          side={bottom}
          name={names[bottom]}
          subtitle={subtitles[bottom]}
          pieces={pieces[bottom]}
          total={startingPieces}
          isActive={currentPlayer === bottom && !gameOver}
          isThinking={isThinking && bottom === 'black'}
          clock={clock}
        />

        {/* Une seule action reste à portée de pouce pendant la partie. */}
        {mode === 'solo' && !gameOver && (
          <button
            type="button"
            className={styles.hint}
            onClick={requestHint}
            disabled={hintsLeft === 0 || currentPlayer !== 'white'}
          >
            Un conseil ?<span className={styles.hintCount}>{hintsLeft}</span>
          </button>
        )}
      </main>

      {sheet === 'menu' && (
        <Modal title="Partie" onClose={() => setSheet(null)}>
          <div className={styles.menu}>
            {mode !== 'daily' && (
              <button
                type="button"
                className={`${styles.menuItem} ${styles.menuPrimary}`}
                onClick={() => {
                  resetGame();
                  setResultHidden(false);
                  setSheet(null);
                }}
              >
                Nouvelle partie
              </button>
            )}

            <button
              type="button"
              className={styles.menuItem}
              onClick={() => setSheet('rules')}
            >
              Règles du jeu
            </button>

            <button type="button" className={styles.menuItem} onClick={toggleMute}>
              {muted ? 'Activer le son' : 'Couper le son'}
            </button>

            {mode === 'online' && roomId && (
              <button
                type="button"
                className={styles.menuItem}
                onClick={() => setSheet('room')}
              >
                Salle et invitation
              </button>
            )}

            <button
              type="button"
              className={`${styles.menuItem} ${styles.menuQuit}`}
              onClick={goHome}
            >
              Quitter la partie
            </button>
          </div>
        </Modal>
      )}

      {sheet === 'rules' && <RulesPanel onClose={() => setSheet(null)} />}

      {showRoom && (
        <Modal
          title="Jouer à distance"
          dismissible={!roomPending}
          // Sans adversaire, il n'y a pas de partie derrière : fermer, c'est
          // renoncer et repartir de l'accueil.
          onClose={roomPending ? goHome : () => setSheet(null)}
        >
          <MultiplayerMenu />
        </Modal>
      )}

      {mode === 'daily' && daily && <DailyPanel />}

      {mode !== 'daily' && (
        <GameOverAnimation
          winner={winner}
          isDraw={status.kind === 'draw'}
          isVisible={gameOver && !resultHidden}
          mode={mode}
          series={series}
          bestChain={bestChain}
          onRematch={() => {
            setResultHidden(false);
            resetGame();
          }}
          onHome={goHome}
          onShare={shareResult}
          onDismiss={() => setResultHidden(true)}
        />
      )}
    </div>
  );
};

export default GameBoard;
