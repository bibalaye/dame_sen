'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Cell from '../Cell';
import { useGameContext } from '@/context/GameContext';
import {
  dropExiting,
  initialPieces,
  reconcilePieces,
  type PieceView,
} from '@/lib/pieceLayer';
import styles from './Board.module.css';

/** Durée de l'animation de sortie d'une pièce prise, en millisecondes. */
const EXIT_DURATION = 340;

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
    isFlipped,
    gameId,
    BOARD_SIZE,
  } = useGameContext();

  // Les pièces sont rendues dans une couche à part, avec un identifiant stable :
  // c'est ce qui permet de les faire glisser d'une case à l'autre au lieu de
  // les démonter puis les remonter ailleurs.
  const [pieces, setPieces] = useState<readonly PieceView[]>([]);
  const nextIdRef = useRef(1);
  const boardRef = useRef(board);

  useEffect(() => {
    const fresh = initialPieces(board, nextIdRef.current);
    nextIdRef.current = fresh.nextId;
    boardRef.current = board;
    setPieces(fresh.pieces);
    // Une nouvelle partie repart d'un jeu de pièces neuf.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  useEffect(() => {
    if (boardRef.current === board) return;
    boardRef.current = board;

    setPieces((current) => {
      const reconciled = reconcilePieces(
        dropExiting(current),
        board,
        lastMove,
        nextIdRef.current,
      );
      nextIdRef.current = reconciled.nextId;
      return reconciled.pieces;
    });
  }, [board, lastMove]);

  // Les pièces prises quittent la liste une fois leur animation terminée.
  useEffect(() => {
    if (!pieces.some((piece) => piece.exiting)) return;
    const timer = setTimeout(
      () => setPieces((current) => dropExiting(current)),
      EXIT_DURATION,
    );
    return () => clearTimeout(timer);
  }, [pieces]);

  const movableKeys = useMemo(
    () => new Set(movableCells.map(({ row, col }) => `${row}-${col}`)),
    [movableCells],
  );

  const cellPercent = 100 / BOARD_SIZE;

  return (
    <div className={styles.boardWrapper}>
      <div
        className={`${styles.board} ${isFlipped ? styles.flipped : ''}`}
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
                isLastMove={
                  lastMove !== null &&
                  ((lastMove.fromRow === rowIndex && lastMove.fromCol === colIndex) ||
                    (lastMove.toRow === rowIndex && lastMove.toCol === colIndex))
                }
                isHint={
                  hint !== null && hint.toRow === rowIndex && hint.toCol === colIndex
                }
                isMiddleCell={rowIndex === 2 && colIndex === 2}
                onClick={() => handleCellClick(rowIndex, colIndex)}
              />
            );
          }),
        )}

        <div className={styles.pieceLayer} aria-hidden="true">
          {pieces.map((piece) => {
            const isMovable = movableKeys.has(`${piece.row}-${piece.col}`);
            const isOwnSide = piece.player === currentPlayer;

            return (
              <div
                key={piece.id}
                className={[
                  styles.piece,
                  piece.player === 'white' ? styles.white : styles.black,
                  piece.isKing ? styles.king : '',
                  piece.exiting ? styles.exiting : '',
                  piece.promoting ? styles.promoting : '',
                  mustCapture && isMovable ? styles.urgent : '',
                  mustCapture && isOwnSide && !isMovable ? styles.dimmed : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={{
                  left: `${piece.col * cellPercent}%`,
                  top: `${piece.row * cellPercent}%`,
                  width: `${cellPercent}%`,
                  height: `${cellPercent}%`,
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default Board;
