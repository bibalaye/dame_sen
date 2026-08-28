'use client';

import React, { useState } from 'react';
import Modal from '../Modal';
import { useGameContext } from '@/context/GameContext';
import { MAX_ATTEMPTS } from '@/lib/daily';
import styles from './DailyPanel.module.css';

/**
 * Le suivi du défi n'apparaît qu'entre deux essais et à la fin : pendant la
 * recherche, le joueur n'a que le plateau sous les yeux.
 */
const DailyPanel: React.FC = () => {
  const { daily, currentPlayer, retryDaily, shareDaily, goHome } = useGameContext();
  const [copied, setCopied] = useState(false);
  /** Refermé à la croix : le joueur veut revoir la position sans le panneau. */
  const [dismissed, setDismissed] = useState<number | null>(null);

  if (!daily) return null;

  const { puzzle, attempts, solved, finished, streak } = daily;
  const attemptsLeft = MAX_ATTEMPTS - attempts.length;

  // Un essai s'achève quand le trait quitte les blancs.
  const betweenAttempts = !finished && attempts.length > 0 && currentPlayer !== 'white';
  if (!finished && !betweenAttempts) return null;
  if (dismissed === attempts.length) return null;

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
      // Partage refusé ou presse-papiers indisponible : le texte reste affiché,
      // le joueur peut le sélectionner à la main.
      setCopied(false);
    }
  };

  const lastTaken = attempts[attempts.length - 1] ?? 0;

  return (
    <Modal
      variant="center"
      dismissible={false}
      title={
        finished
          ? solved
            ? 'Défi réussi !'
            : 'Défi manqué'
          : 'Essai terminé'
      }
      onClose={() => setDismissed(attempts.length)}
    >
      <div className={styles.body}>
        <div className={styles.score}>
          <span className={styles.taken}>{lastTaken}</span>
          <span className={styles.outOf}>/ {puzzle.target} prises</span>
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
                {played ? taken : '—'}
              </li>
            );
          })}
        </ol>

        {streak > 0 && finished && (
          <p className={styles.streak}>Série : {streak} jours</p>
        )}

        {finished ? (
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
            <p className={styles.footnote}>Un nouveau défi vous attend demain.</p>
          </>
        ) : (
          <button type="button" className={styles.primary} onClick={retryDaily}>
            Nouvel essai · {attemptsLeft} restant{attemptsLeft > 1 ? 's' : ''}
          </button>
        )}
      </div>
    </Modal>
  );
};

export default DailyPanel;
