'use client';

import React, { useEffect, useState } from 'react';
import styles from './ComboBanner.module.css';

interface ComboBannerProps {
  /** Nombre de prises enchaînées par le tour en cours. */
  chainLength: number;
}

/** Le nom du coup, qui monte avec le nombre de prises. */
const label = (count: number) => {
  if (count >= 4) return `Rafle ×${count}`;
  if (count === 3) return 'Triplé';
  return 'Doublé';
};

/**
 * Le sommet du jeu : enchaîner des prises. Rien ne le célébrait — le compteur
 * de pièces changeait, c'est tout. Le bandeau apparaît dès la deuxième prise
 * d'un même tour et s'efface tout seul.
 */
const ComboBanner: React.FC<ComboBannerProps> = ({ chainLength }) => {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (chainLength < 2) return;
    setShown(chainLength);
    const timer = setTimeout(() => setShown(0), 1300);
    return () => clearTimeout(timer);
  }, [chainLength]);

  if (shown < 2) return null;

  return (
    <div className={styles.banner} role="status" key={shown}>
      <span className={styles.label}>{label(shown)}</span>
      <span className={styles.detail}>
        {shown} pièces prises d’affilée
      </span>
    </div>
  );
};

export default ComboBanner;
