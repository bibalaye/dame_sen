'use client';

import React from 'react';
import { formatTime, isCritical, type ClockState } from '@/lib/clock';
import type { Player } from '@/lib/engine';
import styles from './PlayerBar.module.css';

interface PlayerBarProps {
  side: Player;
  name: string;
  /** Sous-titre : caractère de l'adversaire, ou état de la liaison. */
  subtitle?: string;
  pieces: number;
  /** Nombre de pièces au départ, pour la jauge. */
  total: number;
  isActive: boolean;
  isThinking?: boolean;
  clock: ClockState;
}

/**
 * Le bandeau d'un joueur : qui il est, ce qui lui reste, son temps.
 *
 * L'adversaire est en haut, le joueur en bas, comme sur une table. Le camp au
 * trait s'illumine : plus besoin d'une phrase pour dire à qui de jouer.
 */
const PlayerBar: React.FC<PlayerBarProps> = ({
  side,
  name,
  subtitle,
  pieces,
  total,
  isActive,
  isThinking = false,
  clock,
}) => {
  const remaining = clock.remaining[side];
  const ratio = total > 0 ? Math.max(0, Math.min(1, pieces / total)) : 0;
  const captured = Math.max(0, total - pieces);

  return (
    <div
      className={[
        styles.bar,
        side === 'white' ? styles.white : styles.black,
        isActive ? styles.active : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span className={styles.avatar} aria-hidden="true">
        <span className={styles.disc} />
      </span>

      <span className={styles.identity}>
        <span className={styles.name}>{name}</span>
        <span className={styles.subtitle}>
          {isThinking ? 'réfléchit…' : (subtitle ?? `${captured} pièce${captured > 1 ? 's' : ''} prise${captured > 1 ? 's' : ''}`)}
        </span>
      </span>

      <span className={styles.stats}>
        <span className={styles.count} aria-label={`${pieces} pièces restantes`}>
          {pieces}
        </span>
        {clock.control !== 'none' && (
          <span
            className={[
              styles.clock,
              clock.running === side ? styles.clockRunning : '',
              isCritical(remaining) ? styles.clockCritical : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {formatTime(remaining)}
          </span>
        )}
      </span>

      {/* La jauge donne l'écart d'un coup d'œil, sans lire les chiffres. */}
      <span className={styles.gauge} aria-hidden="true">
        <span className={styles.fill} style={{ transform: `scaleX(${ratio})` }} />
      </span>
    </div>
  );
};

export default PlayerBar;
