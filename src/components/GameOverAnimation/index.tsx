'use client';

import React, { useEffect, useState } from 'react';
import ReactConfetti from 'react-confetti';
import type { Player } from '@/lib/engine';
import styles from './GameOverAnimation.module.css';

interface GameOverAnimationProps {
  winner: Player | null;
  isDraw: boolean;
  isVisible: boolean;
  onRematch: () => void;
}

const GameOverAnimation: React.FC<GameOverAnimationProps> = ({
  winner,
  isDraw,
  isVisible,
  onRematch,
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

  const playerWon = winner === 'white';

  return (
    <div className={styles.gameOverContainer} role="alertdialog" aria-modal="true">
      {playerWon && windowSize.width > 0 && (
        <ReactConfetti
          width={windowSize.width}
          height={windowSize.height}
          recycle={false}
          numberOfPieces={500}
          gravity={0.2}
        />
      )}

      <div className={playerWon ? styles.victoryMessage : styles.gameOverMessage}>
        {isDraw ? (
          <>
            <h2>Partie nulle</h2>
            <p>Personne ne prend l’avantage : la partie s’arrête.</p>
          </>
        ) : playerWon ? (
          <>
            <h2>Félicitations !</h2>
            <p>Vous avez gagné.</p>
          </>
        ) : (
          <>
            <h2>Partie perdue</h2>
            <p>Votre adversaire l’emporte cette fois.</p>
          </>
        )}

        <button type="button" className={styles.rematch} onClick={onRematch}>
          Revanche
        </button>
      </div>
    </div>
  );
};

export default GameOverAnimation;
