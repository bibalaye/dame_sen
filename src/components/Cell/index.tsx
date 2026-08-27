'use client';

import React from 'react';
import styles from './Cell.module.css';
import type { Square } from '@/lib/engine';

interface CellProps {
  row: number;
  col: number;
  /** Sert uniquement à décrire la case pour les lecteurs d'écran : les pièces
   *  visibles sont rendues par la couche animée du plateau. */
  piece: Square;
  isSelected: boolean;
  isValidMove: boolean;
  isCapture: boolean;
  isLastMove: boolean;
  isHint: boolean;
  isMiddleCell: boolean;
  onClick: () => void;
}

/** Notation des cases : a1 dans le coin du camp blanc, e5 à l'opposé. */
const squareName = (row: number, col: number) =>
  `${String.fromCharCode(97 + col)}${row + 1}`;

const describePiece = (piece: Square) => {
  if (!piece) return 'case vide';
  const side = piece.player === 'white' ? 'blanc' : 'noir';
  return piece.isKing ? `dame ${side}e` : `pion ${side}`;
};

const Cell: React.FC<CellProps> = ({
  row,
  col,
  piece,
  isSelected,
  isValidMove,
  isCapture,
  isLastMove,
  isHint,
  isMiddleCell,
  onClick,
}) => {
  const className = [
    styles.cell,
    isSelected ? styles.selected : '',
    isValidMove ? styles.validMove : '',
    isCapture ? styles.captureMove : '',
    isLastMove ? styles.lastMove : '',
    isHint ? styles.hint : '',
    isMiddleCell ? styles.middleCell : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      className={className}
      onClick={onClick}
      data-row={row}
      data-col={col}
      aria-label={`${squareName(row, col)}, ${describePiece(piece)}`}
      aria-pressed={isSelected}
    />
  );
};

export default Cell;
