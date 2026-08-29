'use client';

import React, { useEffect, useState } from 'react';
import ReactConfetti from 'react-confetti';
import type { Player } from '@/lib/engine';
import type { GameMode } from '@/context/GameContext';
import styles from './GameOverAnimation.module.css';

interface GameOverAnimationProps {
  winner: Player | null;
  isDraw: boolean;
  /** Ce qui a mis fin à la partie, pour l'expliquer au joueur. */
  reason: string | null;
  isVisible: boolean;
  mode: GameMode;
  /** Score cumulé des revanches de la série en cours. */
  series: { white: number; black: number };
  bestChain: number;
  onRematch: () => void;
  /**
   * Où en est la revanche, en ligne uniquement. Hors ligne, le bouton relance
   * la partie sans rien demander à personne.
   */
  rematch?: 'idle' | 'asked' | 'offered' | 'declined';
  onDeclineRematch?: () => void;
  /**
   * Le camp du joueur. En ligne, il peut être noir — et les couleurs
   * s'échangent à chaque revanche : sans cette information, l'écran annonçait
   * une victoire à celui qui venait de perdre.
   */
  mySide?: Player;
  onHome: () => void;
  onShare: () => void;
  /** Referme le panneau pour laisser voir la position finale. */
  onDismiss: () => void;
}

const GameOverAnimation: React.FC<GameOverAnimationProps> = ({
  winner,
  isDraw,
  reason,
  isVisible,
  mode,
  series,
  bestChain,
  onRematch,
  rematch = 'idle',
  onDeclineRematch,
  mySide,
  onHome,
  onShare,
  onDismiss,
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

  // Le camp du joueur : les blancs partout, sauf en ligne où on peut être noir.
  const moi: Player = mode === 'online' ? (mySide ?? 'white') : 'white';
  const jaiGagne = winner === moi;

  // À deux sur le même appareil, il n'y a pas de « vous » : on nomme le camp.
  const celebrate = !isDraw && (mode === 'pass' || jaiGagne);

  const heading = isDraw
    ? 'Partie nulle'
    : mode === 'pass'
      ? `Les ${winner === 'white' ? 'blancs' : 'noirs'} gagnent`
      : jaiGagne
        ? 'Vous gagnez !'
        : 'Partie perdue';

  const detail = isDraw
    ? reason === 'lone-pieces'
      ? 'Une pièce chacun : plus personne ne peut forcer la décision.'
      : reason === 'repetition'
        ? 'La même position est revenue trois fois.'
        : 'Vingt-cinq coups sans prise ni promotion.'
    : mode === 'pass'
      ? 'Passez l’appareil pour la revanche.'
      : reason === 'timeout'
        ? jaiGagne
          ? 'Votre adversaire a épuisé son temps.'
          : 'Votre temps est écoulé.'
        : jaiGagne
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
        <button
          type="button"
          className={styles.close}
          onClick={onDismiss}
          aria-label="Fermer et revoir la position"
        >
          ✕
        </button>
        <h2>{heading}</h2>
        <p>{detail}</p>

        {(series.white > 0 || series.black > 0) && (
          <p className={styles.series}>
            Série&nbsp;: <strong>{series.white}</strong> —{' '}
            <strong>{series.black}</strong>
          </p>
        )}

        {bestChain >= 2 && (
          <p className={styles.feat}>
            Plus longue rafle&nbsp;: {bestChain} prises
          </p>
        )}

        {/*
          En ligne, une revanche se demande à deux : le bouton dit où en est
          l'échange plutôt que de relancer un plateau que l'autre ne verrait
          pas.
        */}
        {rematch === 'declined' && (
          <p className={styles.declined}>
            Votre adversaire préfère en rester là.
          </p>
        )}

        <div className={styles.actions}>
          {rematch === 'asked' ? (
            <button type="button" className={`uiButton ${styles.rematch}`} disabled>
              Proposée…
            </button>
          ) : (
            <button
              type="button"
              className={`uiButton ${styles.rematch}`}
              onClick={onRematch}
            >
              {rematch === 'offered' ? 'Accepter' : 'Revanche'}
            </button>
          )}

          {rematch === 'offered' && onDeclineRematch ? (
            <button type="button" className={styles.secondary} onClick={onDeclineRematch}>
              Refuser
            </button>
          ) : (
            <button type="button" className={styles.secondary} onClick={onShare}>
              Partager
            </button>
          )}
        </div>

        {rematch === 'offered' && (
          <p className={styles.offered}>Votre adversaire veut rejouer.</p>
        )}
        <button type="button" className={styles.link} onClick={onHome}>
          Retour à l’accueil
        </button>
      </div>
    </div>
  );
};

export default GameOverAnimation;
