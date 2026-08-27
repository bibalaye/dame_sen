'use client';

import React, { useEffect, useState } from 'react';
import ReactConfetti from 'react-confetti';
import type { Player } from '@/lib/engine';
import type { GameMode } from '@/context/GameContext';
import styles from './GameOverAnimation.module.css';

interface GameOverAnimationProps {
  winner: Player | null;
  isDraw: boolean;
  isVisible: boolean;
  mode: GameMode;
  onRematch: () => void;
  onHome: () => void;
}

const GameOverAnimation: React.FC<GameOverAnimationProps> = ({
  winner,
  isDraw,
  isVisible,
  mode,
  onRematch,
  onHome,
}) => {
  const [windowSize, setWindowSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const handleResize = () =>
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (!isVisible) return null;

  // À deux sur le même appareil, il n'y a pas de « vous » : on nomme le camp.
  const celebrate = !isDraw && (mode === 'pass' || winner === 'white');

  const heading = isDraw
    ? 'Partie nulle'
    : mode === 'pass'
      ? `Les ${winner === 'white' ? 'blancs' : 'noirs'} gagnent`
      : winner === 'white'
        ? 'Vous gagnez !'
        : 'Partie perdue';

  const detail = isDraw
    ? 'Personne ne prend l’avantage : la partie s’arrête.'
    : mode === 'pass'
      ? 'Passez l’appareil pour la revanche.'
      : winner === 'white'
        ? 'Bien joué.'
        : 'Votre adversaire l’emporte cette fois.';

  return (
    <div className={styles.gameOverContainer} role="alertdialog" aria-modal="true">
      {celebrate && windowSize.width > 0 && (
        <ReactConfetti
          width={windowSize.width}
          height={windowSize.height}
          recycle={false}
          numberOfPieces={420}
          gravity={0.22}
        />
      )}

      <div className={celebrate ? styles.victoryMessage : styles.gameOverMessage}>
        <h2>{heading}</h2>
        <p>{detail}</p>

        <div className={styles.actions}>
          <button type="button" className={styles.rematch} onClick={onRematch}>
            Revanche
          </button>
          <button type="button" className={styles.secondary} onClick={onHome}>
            Accueil
          </button>
        </div>
      </div>
    </div>
  );
};

export default GameOverAnimation;
