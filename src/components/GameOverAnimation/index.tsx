'use client';

import React, { useEffect, useState } from 'react';
import ReactConfetti from 'react-confetti';
import styles from './GameOverAnimation.module.css';

interface GameOverAnimationProps {
  winner: 'white' | 'black' | null;
  isVisible: boolean;
}

const GameOverAnimation: React.FC<GameOverAnimationProps> = ({ winner, isVisible }) => {
  const [windowSize, setWindowSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 0,
    height: typeof window !== 'undefined' ? window.innerHeight : 0,
  });

  useEffect(() => {
    const handleResize = () => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (!isVisible) return null;

  return (
    <div className={styles.gameOverContainer}>
      {winner === 'white' ? (
        // Victory animation for human player (white)
        <>
          <ReactConfetti
            width={windowSize.width}
            height={windowSize.height}
            recycle={false}
            numberOfPieces={500}
            gravity={0.2}
          />
          <div className={styles.victoryMessage}>
            <h2>Félicitations!</h2>
            <p>Vous avez gagné!</p>
          </div>
        </>
      ) : (
        // Game over animation for AI win (black)
        <div className={styles.gameOverMessage}>
          <h2>Game Over</h2>
          <p>L'IA a gagné cette partie</p>
          <div className={styles.sadFace}>😢</div>
        </div>
      )}
    </div>
  );
};

export default GameOverAnimation;