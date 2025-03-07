'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { CellType, PlayerType, SelectedCellType, MoveType } from '@/types/game';
import { useSocketContext } from './SocketContext';

interface GameContextType {
  board: CellType[][];
  currentPlayer: PlayerType;
  selectedCell: SelectedCellType | null;
  validMoves: MoveType[];
  whitePieces: number;
  blackPieces: number;
  gameOver: boolean;
  message: string;
  BOARD_SIZE: number;
  isMultiplayer: boolean;
  roomId: string | null;
  playerType: PlayerType | null;
  opponent: string | null;
  isWaitingForOpponent: boolean;
  handleCellClick: (row: number, col: number) => void;
  resetGame: () => void;
  createRoom: (username: string) => void;
  joinRoom: (roomId: string, username: string) => void;
  setMultiplayerMode: (isMultiplayer: boolean) => void;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

export const useGameContext = () => {
  const context = useContext(GameContext);
  if (!context) {
    throw new Error('useGameContext must be used within a GameProvider');
  }
  return context;
};

interface GameProviderProps {
  children: ReactNode;
}

export const GameProvider: React.FC<GameProviderProps> = ({ children }) => {
  const BOARD_SIZE = 5;
  const WHITE_PLAYER: PlayerType = 'white';
  const BLACK_PLAYER: PlayerType = 'black';
  const AI_PLAYER = BLACK_PLAYER;
  const HUMAN_PLAYER = WHITE_PLAYER;
  
  // Socket context for multiplayer
  const { 
    socket, 
    isConnected, 
    roomId, 
    playerType, 
    opponent, 
    isMultiplayer: socketIsMultiplayer,
    isGameStarted,
    makeMove: socketMakeMove,
    syncGameState,
    notifyGameOver,
    createRoom: socketCreateRoom,
    joinRoom: socketJoinRoom,
    setMultiplayerMode: socketSetMultiplayerMode
  } = useSocketContext();
  
  const [board, setBoard] = useState<CellType[][]>([]);
  const [currentPlayer, setCurrentPlayer] = useState<PlayerType>(WHITE_PLAYER);
  const [selectedCell, setSelectedCell] = useState<SelectedCellType | null>(null);
  const [validMoves, setValidMoves] = useState<MoveType[]>([]);
  const [mandatoryCaptures, setMandatoryCaptures] = useState<MoveType[]>([]);
  const [whitePieces, setWhitePieces] = useState(12);
  const [blackPieces, setBlackPieces] = useState(12);
  const [gameOver, setGameOver] = useState(false);
  const [message, setMessage] = useState('Le joueur Blanc commence');
  const [isAITurn, setIsAITurn] = useState(false);
  const [isMultiplayer, setIsMultiplayer] = useState(false);
  const [isWaitingForOpponent, setIsWaitingForOpponent] = useState(false);

  // Initialize the game
  useEffect(() => {
    initGame();
  }, []);
  
  // Handle socket connection status changes
  useEffect(() => {
    if (isMultiplayer && isConnected) {
      setMessage('Connecté au serveur');
    }
  }, [isMultiplayer, isConnected]);
  
  // Handle opponent joining
  useEffect(() => {
    if (opponent) {
      setIsWaitingForOpponent(false);
      setMessage(`${opponent} a rejoint la partie!`);
    }
  }, [opponent]);
  
  // Handle game start in multiplayer mode
  useEffect(() => {
    if (isMultiplayer && isGameStarted) {
      initGame();
      setMessage(playerType === WHITE_PLAYER ? 'C\'est votre tour' : 'En attente de l\'adversaire');
    }
  }, [isGameStarted, playerType, isMultiplayer]);
  
  // Handle opponent moves
  useEffect(() => {
    if (!socket || !isMultiplayer) return;
    
    const handleOpponentMove = (data: { move: MoveType }) => {
      console.log('Received opponent move:', data.move);
      // Execute the move without sending it back to the server
      const { fromRow, fromCol, toRow, toCol, captureRow, captureCol } = data.move;
      
      if (fromRow === undefined || fromCol === undefined) return;
      
      const newBoard = [...board.map(row => [...row.map(cell => ({ ...cell }))])];
      const movingPiece = { ...newBoard[fromRow][fromCol].piece! };
      
      // Move the piece
      newBoard[toRow][toCol].piece = movingPiece;
      newBoard[fromRow][fromCol].piece = null;
      
      // Handle capture
      if (captureRow !== undefined && captureCol !== undefined) {
        const capturedPiece = newBoard[captureRow][captureCol].piece;
        if (capturedPiece) {
          if (capturedPiece.player === WHITE_PLAYER) {
            setWhitePieces(prev => prev - 1);
          } else {
            setBlackPieces(prev => prev - 1);
          }
          newBoard[captureRow][captureCol].piece = null;
        }
      }
      
      // Check for promotion
      if (!movingPiece.isKing) {
        if ((movingPiece.player === WHITE_PLAYER && toRow === BOARD_SIZE - 1) ||
            (movingPiece.player === BLACK_PLAYER && toRow === 0)) {
          movingPiece.isKing = true;
        }
      }
      
      setBoard(newBoard);
      setCurrentPlayer(playerType as PlayerType);
      setMessage('C\'est votre tour');
      checkGameOver();
    };
    
    socket.on('opponent-move', handleOpponentMove);
    
    return () => {
      socket.off('opponent-move', handleOpponentMove);
    };
  }, [socket, isMultiplayer, playerType, board]);
  
  // Handle game state updates
  useEffect(() => {
    if (!socket || !isMultiplayer) return;
    
    const handleGameStateUpdate = (data: { board: CellType[][], currentPlayer: PlayerType }) => {
      console.log('Received game state update from server:', data);
      // Deep clone the received board to avoid reference issues
      const newBoard = data.board.map(row => row.map(cell => ({
        piece: cell.piece ? {
          player: cell.piece.player,
          isKing: cell.piece.isKing
        } : null
      })));
      
      // Update the local board state
      setBoard(newBoard);
      
      // Update current player
      setCurrentPlayer(data.currentPlayer);
      
      // Update piece counts
      let whiteCount = 0;
      let blackCount = 0;
      
      newBoard.forEach(row => {
        row.forEach(cell => {
          if (cell.piece) {
            if (cell.piece.player === WHITE_PLAYER) {
              whiteCount++;
            } else {
              blackCount++;
            }
          }
        });
      });
      
      setWhitePieces(whiteCount);
      setBlackPieces(blackCount);
      
      // Set appropriate message
      if (data.currentPlayer === playerType) {
        setMessage('C\'est votre tour');
      } else {
        setMessage('En attente de l\'adversaire');
      }
      
      // Check for game over
      checkGameOver();
    };
    
    socket.on('game-state-updated', handleGameStateUpdate);
    
    return () => {
      socket.off('game-state-updated', handleGameStateUpdate);
    };
  }, [socket, isMultiplayer, playerType]);

  // AI turn handling
  useEffect(() => {
    if (!isMultiplayer && isAITurn && !gameOver) {
      const timer = setTimeout(() => {
        makeAIMove();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isAITurn, gameOver, isMultiplayer]);

  // Initialize the game board
  const initGame = () => {
    const newBoard: CellType[][] = [];
    
    // Create empty board
    for (let row = 0; row < BOARD_SIZE; row++) {
      newBoard[row] = [];
      for (let col = 0; col < BOARD_SIZE; col++) {
        newBoard[row][col] = { piece: null };
      }
    }
    
    // Place white pieces (first two rows)
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        newBoard[row][col] = { 
          piece: { player: WHITE_PLAYER, isKing: false } 
        };
      }
    }
    
    // Two additional white pieces on the left of the 3rd row
    newBoard[2][0] = { piece: { player: WHITE_PLAYER, isKing: false } };
    newBoard[2][1] = { piece: { player: WHITE_PLAYER, isKing: false } };
    
    // Place black pieces (last two rows)
    for (let row = BOARD_SIZE - 2; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        newBoard[row][col] = { 
          piece: { player: BLACK_PLAYER, isKing: false } 
        };
      }
    }
    
    // Two additional black pieces on the right of the 3rd row
    newBoard[2][3] = { piece: { player: BLACK_PLAYER, isKing: false } };
    newBoard[2][4] = { piece: { player: BLACK_PLAYER, isKing: false } };
    
    setBoard(newBoard);
    setCurrentPlayer(WHITE_PLAYER);
    setSelectedCell(null);
    setValidMoves([]);
    setMandatoryCaptures([]);
    setWhitePieces(12);
    setBlackPieces(12);
    setGameOver(false);
    setMessage('Le joueur Blanc commence');
    setIsAITurn(false);
  };

  // Handle cell click
  const handleCellClick = (row: number, col: number) => {
    if (gameOver) return;
    
    // In multiplayer mode, only allow moves if it's the player's turn
    if (isMultiplayer && currentPlayer !== playerType) {
      console.log('Not your turn');
      return;
    }
    
    // If it's AI's turn in single player mode, don't allow player moves
    if (!isMultiplayer && currentPlayer === AI_PLAYER) return;
    
    const cell = board[row][col];
    
    // Check for mandatory captures
    if (!selectedCell) {
      const allCaptures = findAllMandatoryCaptures();
      if (allCaptures.length > 0) {
        setMandatoryCaptures(allCaptures);
      }
    }
    
    // If no cell is selected
    if (!selectedCell) {
      // If the clicked cell has a piece of the current player
      if (cell.piece && cell.piece.player === currentPlayer) {
        // Check for mandatory captures
        if (mandatoryCaptures.length > 0) {
          const hasMandatoryCapture = mandatoryCaptures.some(
            capture => capture.fromRow === row && capture.fromCol === col
          );

          if (hasMandatoryCapture) {
            setSelectedCell({ row, col });
            setValidMoves(mandatoryCaptures.filter(
              capture => capture.fromRow === row && capture.fromCol === col
            ));
          } else {
            setMessage('Capture obligatoire disponible avec une autre pièce!');
          }
        } else {
          setSelectedCell({ row, col });
          setValidMoves(findValidMoves(row, col));
        }
      }
    }
    // If a cell is already selected
    else {
      // If the clicked cell is a valid destination
      const moveIndex = validMoves.findIndex(
        move => move.toRow === row && move.toCol === col
      );

      if (moveIndex !== -1) {
        const move = validMoves[moveIndex];
        executeMove(move);

        // Check for additional captures
        if (move.captureRow !== undefined && move.captureCol !== undefined) {
          const additionalCaptures = findCapturesForPiece(row, col);
          if (additionalCaptures.length > 0) {
            setSelectedCell({ row, col });
            setValidMoves(additionalCaptures);
            setMessage('Capture multiple disponible! Continuez.');
            return;
          }
        }

        // End turn
        clearSelection();
        switchPlayer();
      }
      // If the clicked cell is the selected cell, deselect it
      else if (row === selectedCell.row && col === selectedCell.col) {
        clearSelection();
      }
      // If the clicked cell has a piece of the current player, change selection
      else if (cell.piece && cell.piece.player === currentPlayer) {
        // Check for mandatory captures
        if (mandatoryCaptures.length > 0) {
          const hasMandatoryCapture = mandatoryCaptures.some(
            capture => capture.fromRow === row && capture.fromCol === col
          );

          if (hasMandatoryCapture) {
            setSelectedCell({ row, col });
            setValidMoves(mandatoryCaptures.filter(
              capture => capture.fromRow === row && capture.fromCol === col
            ));
          } else {
            setMessage('Capture obligatoire disponible avec une autre pièce!');
          }
        } else {
          setSelectedCell({ row, col });
          setValidMoves(findValidMoves(row, col));
        }
      }
    }
  };

  // Execute a move
  const executeMove = (move: MoveType) => {
    const { fromRow, fromCol, toRow, toCol, captureRow, captureCol } = move;
    if (fromRow === undefined || fromCol === undefined) return;
    
    // In multiplayer mode, send the move to the server only if it's the player's turn
    if (isMultiplayer && currentPlayer === playerType) {
      console.log('Sending move to server:', move);
      socketMakeMove(move);
    }

    const newBoard = [...board.map(row => [...row.map(cell => ({ ...cell }))])]; 
    const movingPiece = { ...newBoard[fromRow][fromCol].piece! };
    
    // Move the piece
    newBoard[toRow][toCol].piece = movingPiece;
    newBoard[fromRow][fromCol].piece = null;
    
    // Handle capture
    let madeCapture = false;
    if (captureRow !== undefined && captureCol !== undefined) {
      const capturedPiece = newBoard[captureRow][captureCol].piece;
      if (capturedPiece) {
        if (capturedPiece.player === WHITE_PLAYER) {
          setWhitePieces(prev => prev - 1);
        } else {
          setBlackPieces(prev => prev - 1);
        }
        newBoard[captureRow][captureCol].piece = null;
        madeCapture = true;
      }
    }
    
    // Check for promotion
    if (!movingPiece.isKing) {
      if ((movingPiece.player === WHITE_PLAYER && toRow === BOARD_SIZE - 1) ||
          (movingPiece.player === BLACK_PLAYER && toRow === 0)) {
        movingPiece.isKing = true;
      }
    }
    
    setBoard(newBoard);
    
    // Return whether a capture was made (for handling multiple captures)
    return { madeCapture, newPosition: { row: toRow, col: toCol } };
  };

  // Find valid moves for a piece
  const findValidMoves = (row: number, col: number): MoveType[] => {
    const piece = board[row][col].piece;
    if (!piece) return [];

    const moves: MoveType[] = [];

    // Check for captures first (mandatory)
    const captures = findCapturesForPiece(row, col);
    if (captures.length > 0) return captures;

    // For a king
    if (piece.isKing) {
      // Movement in all four directions
      const directions = [
        { dr: -1, dc: 0 }, // up
        { dr: 1, dc: 0 },  // down
        { dr: 0, dc: -1 }, // left
        { dr: 0, dc: 1 }   // right
      ];

      for (const dir of directions) {
        let r = row + dir.dr;
        let c = col + dir.dc;

        while (isValidPosition(r, c)) {
          if (!board[r][c].piece) {
            moves.push({ fromRow: row, fromCol: col, toRow: r, toCol: c });
            r += dir.dr;
            c += dir.dc;
          } else {
            break;
          }
        }
      }
    }
    // For a regular piece
    else {
      const forwardDir = piece.player === WHITE_PLAYER ? 1 : -1;

      // Forward movement
      if (isValidPosition(row + forwardDir, col) && !board[row + forwardDir][col].piece) {
        moves.push({ fromRow: row, fromCol: col, toRow: row + forwardDir, toCol: col });
      }

      // Left movement
      if (isValidPosition(row, col - 1) && !board[row][col - 1].piece) {
        moves.push({ fromRow: row, fromCol: col, toRow: row, toCol: col - 1 });
      }

      // Right movement
      if (isValidPosition(row, col + 1) && !board[row][col + 1].piece) {
        moves.push({ fromRow: row, fromCol: col, toRow: row, toCol: col + 1 });
      }
    }

    return moves;
  };

  // Find captures for a piece
  const findCapturesForPiece = (row: number, col: number): MoveType[] => {
    const piece = board[row][col].piece;
    if (!piece) return [];

    const captures: MoveType[] = [];
    const opponent = piece.player === WHITE_PLAYER ? BLACK_PLAYER : WHITE_PLAYER;

    // For a king
    if (piece.isKing) {
      // Captures in all directions
      const directions = [
        { dr: -1, dc: 0 }, // up
        { dr: 1, dc: 0 },  // down
        { dr: 0, dc: -1 }, // left
        { dr: 0, dc: 1 }   // right
      ];

      for (const dir of directions) {
        let r = row + dir.dr;
        let c = col + dir.dc;

        while (isValidPosition(r, c)) {
          if (board[r][c].piece) {
            if (board[r][c].piece!.player === opponent) {
              // Check if the next cell is free to land
              const landingRow = r + dir.dr;
              const landingCol = c + dir.dc;

              if (isValidPosition(landingRow, landingCol) && !board[landingRow][landingCol].piece) {
                captures.push({
                  fromRow: row,
                  fromCol: col,
                  toRow: landingRow,
                  toCol: landingCol,
                  captureRow: r,
                  captureCol: c
                });
              }
            }
            break;
          }
          r += dir.dr;
          c += dir.dc;
        }
      }
    }
    // For a regular piece
    else {
      // Captures in all directions
      const directions = [
        { dr: 1, dc: 0 },  // down
        { dr: -1, dc: 0 }, // up
        { dr: 0, dc: 1 },  // right
        { dr: 0, dc: -1 }  // left
      ];

      for (const dir of directions) {
        const captureRow = row + dir.dr;
        const captureCol = col + dir.dc;

        if (isValidPosition(captureRow, captureCol) &&
            board[captureRow][captureCol].piece &&
            board[captureRow][captureCol].piece!.player === opponent) {

          const landingRow = captureRow + dir.dr;
          const landingCol = captureCol + dir.dc;

          if (isValidPosition(landingRow, landingCol) && !board[landingRow][landingCol].piece) {
            captures.push({
              fromRow: row,
              fromCol: col,
              toRow: landingRow,
              toCol: landingCol,
              captureRow: captureRow,
              captureCol: captureCol
            });
          }
        }
      }
    }

    return captures;
  };

  // Find all mandatory captures for the current player
  const findAllMandatoryCaptures = (): MoveType[] => {
    const captures: MoveType[] = [];

    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        if (board[row][col].piece && board[row][col].piece!.player === currentPlayer) {
          const pieceCaps = findCapturesForPiece(row, col);
          captures.push(...pieceCaps);
        }
      }
    }

    return captures;
  };

  // Check if a position is valid on the board
  const isValidPosition = (row: number, col: number): boolean => {
    return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
  };

  // Clear selection
  const clearSelection = () => {
    setSelectedCell(null);
    setValidMoves([]);
  };

  // Switch player
  const switchPlayer = () => {
    const nextPlayer = currentPlayer === WHITE_PLAYER ? BLACK_PLAYER : WHITE_PLAYER;
    setCurrentPlayer(nextPlayer);
    
    // In multiplayer mode, send the updated game state to the server
    if (isMultiplayer) {
      // Only sync if it's the current player's turn
      if (currentPlayer === playerType) {
        console.log('Syncing game state with server, next player:', nextPlayer);
        // Sync game state with the server
        syncGameState(board, nextPlayer);
      }
      
      if (nextPlayer === playerType) {
        setMessage("C'est votre tour");
      } else {
        setMessage("En attente de l'adversaire");
      }
    } else {
      // In single-player mode, handle AI turn
      setIsAITurn(prev => !prev);
      
      if (!gameOver) {
        if (currentPlayer === WHITE_PLAYER) {
          setMessage("L'IA réfléchit...");
        } else {
          const mandatoryCaptures = findAllMandatoryCaptures();
          if (mandatoryCaptures.length > 0) {
            setMessage("Vous avez des captures obligatoires!");
          } else {
            setMessage("C'est votre tour");
          }
        }
      }
    }
    
    // Check for game over
    checkGameOver();
  };

  // Check if the game is over
  const checkGameOver = () => {
    let winner: PlayerType | null = null;
    
    if (whitePieces === 0) {
      setGameOver(true);
      setMessage("Le joueur Noir gagne!");
      winner = BLACK_PLAYER;
    } else if (blackPieces === 0) {
      setGameOver(true);
      setMessage("Le joueur Blanc gagne!");
      winner = WHITE_PLAYER;
    } else if (!checkIfPlayerCanMove()) {
      setGameOver(true);
      const winningPlayer = currentPlayer === WHITE_PLAYER ? BLACK_PLAYER : WHITE_PLAYER;
      setMessage(`Le joueur ${winningPlayer === WHITE_PLAYER ? 'Blanc' : 'Noir'} gagne par blocage!`);
      winner = winningPlayer;
    }
    
    // Notify the server about game over in multiplayer mode
    if (winner && isMultiplayer) {
      notifyGameOver(winner);
    }
  };

  // Check if the current player can move
  const checkIfPlayerCanMove = (): boolean => {
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        if (board[row][col].piece && board[row][col].piece!.player === currentPlayer) {
          const moves = findValidMoves(row, col);
          if (moves.length > 0) return true;
        }
      }
    }
    return false;
  };

  // Evaluate the board for AI
  const evaluateBoard = (): number => {
    let score = 0;
    
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const piece = board[row][col].piece;
        if (piece) {
          // Base value of pieces
          let baseValue = piece.isKing ? 3 : 1;
          
          if (piece.player === AI_PLAYER) {
            // Bonus for AI pieces
            baseValue += findCapturesForPiece(row, col).length * 0.5; // Bonus for capture opportunities
            score += baseValue;
            // Bonus for pieces close to promotion
            if (!piece.isKing && row === 0) {
              score += 0.8;
            }
            // Bonus for center control
            if (row === 2 && (col === 1 || col === 2 || col === 3)) {
              score += 0.3;
            }
          } else {
            baseValue += findCapturesForPiece(row, col).length * 0.5;
            score -= baseValue;
            // Penalty for opponent pieces close to promotion
            if (!piece.isKing && row === BOARD_SIZE - 1) {
              score -= 0.8;
            }
          }
        }
      }
    }
    
    return score;
  };

  // Minimax algorithm with Alpha-Beta pruning
  const minimax = (depth: number, isMaximizing: boolean, alpha: number = -Infinity, beta: number = Infinity): number => {
    if (depth === 0 || gameOver) {
      return evaluateBoard();
    }

    const currentPlayerForMove = isMaximizing ? AI_PLAYER : HUMAN_PLAYER;
    let bestScore = isMaximizing ? -Infinity : Infinity;
    let allPossibleMoves: MoveType[] = [];

    // Collect all possible moves
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        if (board[row][col].piece && board[row][col].piece!.player === currentPlayerForMove) {
          const moves = findValidMoves(row, col);
          moves.forEach(move => {
            allPossibleMoves.push({...move});
          });
        }
      }
    }

    for (const move of allPossibleMoves) {
      // Save state
      const savedState = saveGameState();
      
      // Make move
      executeMove(move);

      // Recursive call
      const score = minimax(depth - 1, !isMaximizing, alpha, beta);

      // Restore state
      restoreGameState(savedState);

      if (isMaximizing) {
        bestScore = Math.max(score, bestScore);
        alpha = Math.max(alpha, bestScore);
      } else {
        bestScore = Math.min(score, bestScore);
        beta = Math.min(beta, bestScore);
      }

      if (beta <= alpha) {
        break;
      }
    }

    return bestScore;
  };

  // Save game state
  const saveGameState = () => {
    return {
      board: board.map(row => row.map(cell => ({
        piece: cell.piece ? {...cell.piece} : null
      }))),
      whitePieces,
      blackPieces
    };
  };

  // Restore game state
  const restoreGameState = (state: any) => {
    setBoard(state.board);
    setWhitePieces(state.whitePieces);
    setBlackPieces(state.blackPieces);
  };

  // Make AI move
  const makeAIMove = () => {
    const mandatoryCaptures = findAllMandatoryCaptures();
    
    if (mandatoryCaptures.length > 0) {
      // Choose a random capture if multiple are available
      const randomIndex = Math.floor(Math.random() * mandatoryCaptures.length);
      const move = mandatoryCaptures[randomIndex];
      executeMove(move);
      
      // Check for additional captures
      if (move.captureRow !== undefined && move.toRow !== undefined && move.toCol !== undefined) {
        const additionalCaptures = findCapturesForPiece(move.toRow, move.toCol);
        if (additionalCaptures.length > 0) {
          // Continue capturing
          setTimeout(() => {
            makeAIMove();
          }, 500);
          return;
        }
      }
    } else {
      // Use minimax to find the best move
      let bestScore = -Infinity;
      let bestMove: MoveType | null = null;

      for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
          if (board[row][col].piece && board[row][col].piece!.player === AI_PLAYER) {
            const moves = findValidMoves(row, col);
            for (const move of moves) {
              const savedState = saveGameState();
              executeMove(move);
              
              const score = minimax(2, false); // Depth of 2 for performance
              
              restoreGameState(savedState);

              if (score > bestScore) {
                bestScore = score;
                bestMove = move;
              }
            }
          }
        }
      }

      if (bestMove) {
        executeMove(bestMove);
      }
    }
    
    // End AI turn
    clearSelection();
    switchPlayer();
  };

  // Reset game
  const resetGame = () => {
    initGame();
  };
  
  // Create a new multiplayer room
  const createRoom = useCallback((username: string) => {
    socketCreateRoom(username);
    setIsWaitingForOpponent(true);
    setMessage('En attente d\'un adversaire...');
  }, [socketCreateRoom]);
  
  // Join an existing multiplayer room
  const joinRoom = useCallback((roomId: string, username: string) => {
    socketJoinRoom(roomId, username);
    setMessage('Connexion à la partie...');
  }, [socketJoinRoom]);
  
  // Toggle multiplayer mode
  const setMultiplayerMode = useCallback((multiplayerEnabled: boolean) => {
    setIsMultiplayer(multiplayerEnabled);
    socketSetMultiplayerMode(multiplayerEnabled);
    
    if (!multiplayerEnabled) {
      // Reset to single-player mode
      initGame();
    }
  }, [socketSetMultiplayerMode]);

  return (
    <GameContext.Provider value={{
      board,
      currentPlayer,
      selectedCell,
      validMoves,
      whitePieces,
      blackPieces,
      gameOver,
      message,
      BOARD_SIZE,
      isMultiplayer,
      roomId,
      playerType,
      opponent,
      isWaitingForOpponent,
      handleCellClick,
      resetGame,
      createRoom,
      joinRoom,
      setMultiplayerMode
    }}>
      {children}
    </GameContext.Provider>
  );
};

export default GameContext;