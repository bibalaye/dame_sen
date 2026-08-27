'use client';

import React, { useState } from 'react';
import { useGameContext } from '@/context/GameContext';
import { MAX_ATTEMPTS } from '@/lib/daily';
import styles from './DailyPanel.module.css';

/**
 * Le suivi du défi : l'objectif, les essais consommés, et — une fois terminé —
 * le résultat à recopier dans une conversation.
 */
const DailyPanel: React.FC = () => {
  const { daily, retryDaily, shareDaily, goHome } = useGameContext();
  const [copied, setCopied] = useState(false);

  if (!daily) return null;

  const { puzzle, attempts, solved, finished, streak } = daily;
  const attemptsLeft = MAX_ATTEMPTS - attempts.length;
  const waitingForRetry = !finished && attempts.length > 0;

  const handleShare = async () => {
    const text = shareDaily();
    try {
      if (navigator.share) {
        await navigator.share({ text });
        return;
      }
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // Partage refusé ou presse-papiers indisponible : le texte reste lisible
      // à l'écran, le joueur peut le sélectionner à la main.
      setCopied(false);
    }
  };

  return (
    <section className={styles.panel} aria-label="Défi du jour">
      <header className={styles.header}>
        <span className={styles.number}>Défi n°{puzzle.number}</span>
        {streak > 0 && <span className={styles.streak}>Série : {streak}</span>}
      </header>

      <div className={styles.objective}>
        <span className={styles.target}>{puzzle.target}</span>
        <span className={styles.targetLabel}>
          prises à enchaîner
          <br />
          en un seul tour
        </span>
      </div>

      <ol className={styles.attempts}>
        {Array.from({ length: MAX_ATTEMPTS }, (_, index) => {
          const taken = attempts[index];
          const played = taken !== undefined;
          const isSuccess = played && taken >= puzzle.target;

          return (
            <li
              key={index}
              className={[
                styles.attempt,
                played ? styles.attemptPlayed : '',
                isSuccess ? styles.attemptSuccess : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {played ? `${taken} / ${puzzle.target}` : '—'}
            </li>
          );
        })}
      </ol>

      {waitingForRetry && (
        <button type="button" className={styles.primary} onClick={retryDaily}>
          Nouvel essai ({attemptsLeft} restant{attemptsLeft > 1 ? 's' : ''})
        </button>
      )}

      {finished && (
        <>
          <pre className={styles.share}>{shareDaily()}</pre>
          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={handleShare}>
              {copied ? 'Copié !' : 'Partager'}
            </button>
            <button type="button" className={styles.secondary} onClick={goHome}>
              Accueil
            </button>
          </div>
          <p className={styles.footnote}>
            {solved
              ? 'Revenez demain pour le prochain défi.'
              : 'Un nouveau défi vous attend demain.'}
          </p>
        </>
      )}
    </section>
  );
};

export default DailyPanel;
