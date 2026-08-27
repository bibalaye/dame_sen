'use client';

import React from 'react';
import { formatTime, isCritical, type ClockState } from '@/lib/clock';
import type { Player } from '@/lib/engine';
import styles from './ClockDisplay.module.css';

interface ClockDisplayProps {
  clock: ClockState;
  player: Player;
  isRunning: boolean;
}

const ClockDisplay: React.FC<ClockDisplayProps> = ({ clock, player, isRunning }) => {
  if (clock.control === 'none') return null;

  const remaining = clock.remaining[player];
  const critical = isCritical(remaining);

  return (
    <span
      className={[
        styles.clock,
        isRunning ? styles.running : '',
        critical ? styles.critical : '',
        remaining === 0 ? styles.flagged : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={`Temps restant : ${formatTime(remaining)}`}
    >
      {formatTime(remaining)}
    </span>
  );
};

export default ClockDisplay;
