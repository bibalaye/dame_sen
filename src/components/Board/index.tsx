'use client';

import React, { useMemo } from 'react';
import Cell from '../Cell';
import { useGameContext } from '@/context/GameContext';
import styles from './Board.module.css';

const Board = () => {
  const {
    board,
    currentPlayer,
    selectedCell,
    validMoves,
    movableCells,
    mustCapture,
    lastMove,
    hint,
    handleCellClick,
    BOARD_SIZE,
  } = useGameContext();

  // Les cases dont la pièce a le droit de jouer. Quand une prise est
  // obligatoire, ce sont les seules mises en avant : la règle se voit sur le
  // plateau au lieu d'être annoncée par un message d'erreur.
  const movableKeys = useMemo(
    () => new Set(movableCells.map(({ row, col }) => `${row}-${col}`)),
    [movableCells],
  );

  return (
    <div className={styles.boardWrapper}>
      <div
        className={styles.board}
        role="grid"
        aria-label="Plateau de jeu"
        style={{
          gridTemplateColumns: `repeat(${BOARD_SIZE}, 1fr)`,
          gridTemplateRows: `repeat(${BOARD_SIZE}, 1fr)`,
        }}
      >
        {board.map((row, rowIndex) =>
          row.map((piece, colIndex) => {
            const key = `${rowIndex}-${colIndex}`;
            const move = validMoves.find(
              (candidate) =>
                candidate.toRow === rowIndex && candidate.toCol === colIndex,
            );
            const isMovable = movableKeys.has(key);
            const isOwnSide = piece?.player === currentPlayer;

            return (
              <Cell
                key={key}
                row={rowIndex}
                col={colIndex}
                piece={piece}
                isSelected={
                  selectedCell?.row === rowIndex && selectedCell?.col === colIndex
                }
                isValidMove={move !== undefined}
                isCapture={move?.captureRow !== undefined}
                isMovable={mustCapture && isMovable}
                isDimmed={mustCapture && isOwnSide && !isMovable && piece !== null}
                isLastMove={
                  lastMove !== null &&
                  ((lastMove.fromRow === rowIndex && lastMove.fromCol === colIndex) ||
                    (lastMove.toRow === rowIndex && lastMove.toCol === colIndex))
                }
                isHint={
                  hint !== null &&
                  hint.toRow === rowIndex &&
                  hint.toCol === colIndex
                }
                isMiddleCell={rowIndex === 2 && colIndex === 2}
                onClick={() => handleCellClick(rowIndex, colIndex)}
              />
            );
          }),
        )}
      </div>
    </div>
  );
};

export default Board;
