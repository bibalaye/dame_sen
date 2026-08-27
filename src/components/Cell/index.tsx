'use client';

import React from 'react';
import styles from './Cell.module.css';
import type { Square } from '@/lib/engine';

interface CellProps {
  row: number;
  col: number;
  piece: Square;
  isSelected: boolean;
  isValidMove: boolean;
  isCapture: boolean;
  isMovable: boolean;
  isDimmed: boolean;
  isLastMove: boolean;
  isHint: boolean;
  isMiddleCell: boolean;
  onClick: () => void;
}

/** Notation lue par les lecteurs d'écran : a1 en bas à gauche, e5 en haut à droite. */
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
  isMovable,
  isDimmed,
  isLastMove,
  isHint,
  isMiddleCell,
  onClick,
}) => {
  const cellClasses = [
    styles.cell,
    isSelected ? styles.selected : '',
    isValidMove ? styles.validMove : '',
    isCapture ? styles.captureMove : '',
    isLastMove ? styles.lastMove : '',
    isMiddleCell ? styles.middleCell : '',
  ]
    .filter(Boolean)
    .join(' ');

  const pieceClasses = piece
    ? [
        styles.piece,
        piece.player === 'white' ? styles.whitePiece : styles.blackPiece,
        piece.isKing
          ? piece.player === 'white'
            ? styles.whiteKing
            : styles.blackKing
          : '',
        isMovable ? styles.movable : '',
        isDimmed ? styles.dimmed : '',
        isHint ? styles.hinted : '',
      ]
        .filter(Boolean)
        .join(' ')
    : '';

  return (
    <button
      type="button"
      className={cellClasses}
      onClick={onClick}
      data-row={row}
      data-col={col}
      aria-label={`${squareName(row, col)}, ${describePiece(piece)}`}
      aria-pressed={isSelected}
    >
      {piece && <span className={pieceClasses} />}
    </button>
  );
};

export default Cell;
