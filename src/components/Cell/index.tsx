'use client';

import React from 'react';
import styles from './Cell.module.css';
import { CellType } from '@/types/game';

interface CellProps {
  row: number;
  col: number;
  cell: CellType;
  isSelected: boolean;
  isValidMove: boolean;
  isMiddleCell: boolean;
  onClick: () => void;
}

const Cell: React.FC<CellProps> = ({
  row,
  col,
  cell,
  isSelected,
  isValidMove,
  isMiddleCell,
  onClick
}) => {
  const cellClasses = [
    styles.cell,
    isSelected ? styles.selected : '',
    isValidMove ? styles.validMove : '',
    isMiddleCell ? styles.middleCell : ''
  ].filter(Boolean).join(' ');

  return (
    <div 
      className={cellClasses}
      onClick={onClick}
      data-row={row}
      data-col={col}
    >
      {cell.piece && (
        <div 
          className={`${styles.piece} ${
            cell.piece.player === 'white' ? styles.whitePiece : styles.blackPiece
          } ${cell.piece.isKing ? (cell.piece.player === 'white' ? styles.whiteKing : styles.blackKing) : ''}`}
        />
      )}
    </div>
  );
};

export default Cell;