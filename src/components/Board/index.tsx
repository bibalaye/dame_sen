'use client';

import { useEffect, useState } from 'react';
import Cell from '../Cell';
import { useGameContext } from '@/context/GameContext';
import styles from './Board.module.css';

const Board = () => {
  const { 
    board, 
    selectedCell, 
    validMoves, 
    handleCellClick,
    BOARD_SIZE 
  } = useGameContext();

  return (
    <div className={styles.boardWrapper}>
      <div 
        className={styles.board}
        style={{
          gridTemplateColumns: `repeat(${BOARD_SIZE}, 1fr)`,
          gridTemplateRows: `repeat(${BOARD_SIZE}, 1fr)`
        }}
      >
        {board.map((row, rowIndex) => (
          row.map((cell, colIndex) => (
            <Cell 
              key={`${rowIndex}-${colIndex}`}
              row={rowIndex}
              col={colIndex}
              cell={cell}
              isSelected={selectedCell?.row === rowIndex && selectedCell?.col === colIndex}
              isValidMove={validMoves.some(move => move.toRow === rowIndex && move.toCol === colIndex)}
              isMiddleCell={rowIndex === 2 && colIndex === 2}
              onClick={() => handleCellClick(rowIndex, colIndex)}
            />
          ))
        ))}
      </div>
    </div>
  );
};

export default Board;