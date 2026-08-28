'use client';

import React from 'react';
import Image from 'next/image';
import Modal from '../Modal';
import { useGameContext } from '@/context/GameContext';
import { PIECE_SETS } from '@/lib/pieceSets';
import { canAfford, isUnlocked, priceOf } from '@/lib/economy';
import styles from './PieceSetPicker.module.css';

interface PieceSetPickerProps {
  onClose: () => void;
}

/**
 * Choix des pions.
 *
 * Chaque proposition montre les deux camps et leurs dames : on choisit sur ce
 * qu'on va voir, pas sur un nom. Le choix vaut pour les deux jeux et se garde
 * d'une session à l'autre.
 */
const PieceSetPicker: React.FC<PieceSetPickerProps> = ({ onClose }) => {
  const { pieceSet, setPieceSet, wallet, unlockPieceSet } = useGameContext();

  return (
    <Modal title="Vos pions" onClose={onClose}>
      <div className={styles.grid}>
        {PIECE_SETS.map((set) => (
          <button
            key={set.id}
            type="button"
            className={[
              styles.card,
              pieceSet.id === set.id ? styles.cardOn : '',
              !isUnlocked(wallet, set.id) ? styles.cardLocked : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() =>
              isUnlocked(wallet, set.id) ? setPieceSet(set.id) : unlockPieceSet(set.id)
            }
            disabled={!isUnlocked(wallet, set.id) && !canAfford(wallet, set.id)}
            aria-pressed={pieceSet.id === set.id}
          >
            <span className={styles.preview}>
              <Image src={set.light} width={64} height={64} alt="" />
              <Image src={set.dark} width={64} height={64} alt="" />
              <Image
                className={styles.king}
                src={set.lightKing}
                width={64}
                height={64}
                alt=""
              />
            </span>

            <span className={styles.name}>{set.name}</span>
            <span className={styles.detail}>{set.detail}</span>

            {pieceSet.id === set.id ? (
              <span className={styles.badge} aria-hidden="true">
                En jeu
              </span>
            ) : !isUnlocked(wallet, set.id) ? (
              <span
                className={`${styles.badge} ${
                  canAfford(wallet, set.id) ? styles.badgeBuy : styles.badgeLocked
                }`}
              >
                {priceOf(set.id)} ★
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <p className={styles.note}>
        Le troisième pion montre la dame : la pièce empilée qu’un pion devient en
        atteignant la dernière rangée. Les étoiles se gagnent en jouant —
        vous en avez <strong>{wallet.stars}</strong>.
      </p>
    </Modal>
  );
};

export default PieceSetPicker;
