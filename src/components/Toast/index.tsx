'use client';

import React, { useEffect, useState } from 'react';
import styles from './Toast.module.css';

interface ToastProps {
  /** Message courant ; un changement déclenche l'affichage. */
  message: string;
  /** Les états permanents (« à vous ») sont portés par le bandeau du joueur. */
  mute?: boolean;
}

const VISIBLE_MS = 2400;

/**
 * Message flottant au-dessus du plateau.
 *
 * Remplace l'encadré permanent qui occupait une place fixe sous le plateau : ce
 * qui doit être lu apparaît, puis s'efface. Ce qui est permanent — à qui de
 * jouer — est indiqué par le bandeau du joueur actif.
 */
const Toast: React.FC<ToastProps> = ({ message, mute = false }) => {
  const [shown, setShown] = useState<string | null>(null);

  useEffect(() => {
    if (mute || !message) {
      setShown(null);
      return;
    }

    setShown(message);
    const timer = setTimeout(() => setShown(null), VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [message, mute]);

  if (!shown) return null;

  return (
    <div className={styles.toast} role="status" aria-live="polite" key={shown}>
      {shown}
    </div>
  );
};

export default Toast;
