'use client';

import React, { useCallback, useEffect, useRef } from 'react';
import { play } from '@/lib/sound';
import styles from './Modal.module.css';

interface ModalProps {
  title?: string;
  /** Une feuille qui monte du bas sur mobile, plutôt qu'une boîte centrée. */
  variant?: 'sheet' | 'center';
  /**
   * Empêche la fermeture au clic hors du panneau et à la touche Échap, pour les
   * étapes qu'on ne referme pas d'un geste distrait. La croix reste affichée :
   * une fenêtre sans issue visible est toujours une impasse pour le joueur.
   */
  dismissible?: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * Fenêtre modale unique du jeu.
 *
 * Tout ce qui n'est pas le plateau passe par ici : réglages, règles, salle
 * d'attente, fin de partie. Empilé sous le plateau, ce contenu allongeait la
 * page et détournait le regard pendant la partie.
 */
const Modal: React.FC<ModalProps> = ({
  title,
  variant = 'sheet',
  dismissible = true,
  onClose,
  children,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);

  const handleClose = useCallback(() => {
    if (dismissible) {
      play('click');
      onClose();
    }
  }, [dismissible, onClose]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKey);

    // Le plateau ne doit pas défiler derrière la feuille.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();

    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [handleClose]);

  return (
    <div className={styles.overlay} onClick={handleClose}>
      <div
        ref={panelRef}
        className={`uiPanel ${styles.panel} ${variant === 'center' ? styles.center : styles.sheet}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        {variant === 'sheet' && <span className={styles.grip} aria-hidden="true" />}

        <header className={styles.header}>
          {title && <h2 className={styles.title}>{title}</h2>}
          <button
            type="button"
            className={`uiClose ${styles.close}`}
            onClick={onClose}
            aria-label="Fermer"
          >
            Fermer
          </button>
        </header>

        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
};

export default Modal;
