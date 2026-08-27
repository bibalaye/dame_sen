'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  BOARD_SIZE,
  countPieces,
  createGame,
  hasMandatoryCapture,
  legalMovesFrom,
  movablePositions,
  playMove,
  type Board,
  type GameState,
  type Move,
  type Player,
  type Position,
  type Status,
  type Variant,
} from '@/lib/engine';
import {
  findBestMove,
  suggestMove,
  thinkingDelay,
  type Difficulty,
} from '@/lib/ai';
import { useSocketContext } from './SocketContext';

const HUMAN_PLAYER: Player = 'white';
const AI_PLAYER: Player = 'black';

interface GameContextType {
  board: Board;
  currentPlayer: Player;
  selectedCell: Position | null;
  validMoves: Move[];
  whitePieces: number;
  blackPieces: number;
  gameOver: boolean;
  winner: Player | null;
  status: Status;
  message: string;
  lastMove: Move | null;
  /** Cases dont la pièce peut jouer : sert à mettre en avant les prises dues. */
  movableCells: Position[];
  mustCapture: boolean;
  isThinking: boolean;
  hint: Move | null;
  hintsLeft: number;
  difficulty: Difficulty;
  variant: Variant;
  BOARD_SIZE: number;
  isMultiplayer: boolean;
  roomId: string | null;
  playerType: Player | null;
  opponent: string | null;
  isWaitingForOpponent: boolean;
  handleCellClick: (row: number, col: number) => void;
  resetGame: () => void;
  requestHint: () => void;
  setDifficulty: (difficulty: Difficulty) => void;
  setVariant: (variant: Variant) => void;
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

const MAX_HINTS = 3;

const winnerOf = (status: Status): Player | null =>
  status.kind === 'win' ? status.winner : null;

/** Le texte affiché sous le plateau, déduit du seul état du moteur. */
const describe = (
  state: GameState,
  isMultiplayer: boolean,
  playerType: Player | null,
  isThinking: boolean,
): string => {
  if (state.status.kind === 'win') {
    const side = state.status.winner === 'white' ? 'Blanc' : 'Noir';
    return state.status.reason === 'block'
      ? `Le joueur ${side} gagne par blocage !`
      : `Le joueur ${side} gagne !`;
  }
  if (state.status.kind === 'draw') {
    return state.status.reason === 'repetition'
      ? 'Partie nulle : position répétée trois fois.'
      : 'Partie nulle : 25 coups sans prise ni promotion.';
  }

  if (state.chainFrom) return 'Rafle en cours, continuez avec la même pièce !';

  if (isMultiplayer) {
    return state.currentPlayer === playerType
      ? hasMandatoryCapture(state)
        ? 'À vous — une prise est obligatoire.'
        : 'À vous de jouer.'
      : "En attente de l'adversaire…";
  }

  if (state.currentPlayer === AI_PLAYER) {
    return isThinking ? 'Votre adversaire réfléchit…' : 'Au tour des noirs.';
  }
  return hasMandatoryCapture(state)
    ? 'À vous — une prise est obligatoire.'
    : 'À vous de jouer.';
};

export const GameProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const {
    socket,
    isConnected,
    roomId,
    playerType,
    opponent,
    isGameStarted,
    makeMove: socketMakeMove,
    notifyGameOver,
    createRoom: socketCreateRoom,
    joinRoom: socketJoinRoom,
    setMultiplayerMode: socketSetMultiplayerMode,
  } = useSocketContext();

  const [variant, setVariantState] = useState<Variant>('classic');
  const [difficulty, setDifficultyState] = useState<Difficulty>('medium');
  const [game, setGame] = useState<GameState>(() => createGame('classic'));
  const [selectedCell, setSelectedCell] = useState<Position | null>(null);
  const [isMultiplayer, setIsMultiplayer] = useState(false);
  const [isWaitingForOpponent, setIsWaitingForOpponent] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [hint, setHint] = useState<Move | null>(null);
  const [hintsLeft, setHintsLeft] = useState(MAX_HINTS);
  const [notice, setNotice] = useState<string | null>(null);

  /**
   * L'état courant, lisible depuis les abonnements socket sans les réabonner à
   * chaque coup — c'était la source des désynchronisations précédentes.
   */
  const gameRef = useRef(game);
  gameRef.current = game;

  const reportedWinner = useRef<Player | null>(null);

  const validMoves = useMemo(
    () =>
      selectedCell ? legalMovesFrom(game, selectedCell.row, selectedCell.col) : [],
    [game, selectedCell],
  );

  const movableCells = useMemo(() => movablePositions(game), [game]);
  const mustCapture = useMemo(() => hasMandatoryCapture(game), [game]);

  const whitePieces = useMemo(() => countPieces(game.board, 'white'), [game.board]);
  const blackPieces = useMemo(() => countPieces(game.board, 'black'), [game.board]);

  const gameOver = game.status.kind !== 'playing';
  const winner = winnerOf(game.status);

  const message =
    notice ?? describe(game, isMultiplayer, playerType, isThinking);

  const startGame = useCallback(
    (nextVariant: Variant = variant) => {
      setGame(createGame(nextVariant));
      setSelectedCell(null);
      setIsThinking(false);
      setHint(null);
      setHintsLeft(MAX_HINTS);
      setNotice(null);
      reportedWinner.current = null;
    },
    [variant],
  );

  /**
   * Joue un coup localement, et le transmet en multijoueur si c'est le nôtre.
   * L'émission réseau reste en dehors du setter d'état : React peut rejouer un
   * setter, jamais un effet de bord.
   */
  const commitMove = useCallback(
    (move: Move, broadcast: boolean) => {
      const current = gameRef.current;
      const next = playMove(current, move);
      if (next === current) return;

      gameRef.current = next;
      setGame(next);
      setSelectedCell(null);
      setHint(null);
      setNotice(null);

      if (broadcast && isMultiplayer) {
        socketMakeMove(move, next.currentPlayer);
      }
    },
    [isMultiplayer, socketMakeMove],
  );

  // --- Tour de l'adversaire artificiel -----------------------------------

  /**
   * `commitMove` est recréé dès qu'un callback du contexte socket change.
   * Le garder hors des dépendances évite que le minuteur de réflexion soit
   * relancé à chaque rendu — auquel cas l'adversaire ne jouerait jamais.
   */
  const commitMoveRef = useRef(commitMove);
  commitMoveRef.current = commitMove;

  useEffect(() => {
    if (isMultiplayer || gameOver) return;
    if (game.currentPlayer !== AI_PLAYER) return;

    setIsThinking(true);
    const delay = thinkingDelay(game);

    const timer = setTimeout(() => {
      const { move } = findBestMove(gameRef.current, difficulty);
      setIsThinking(false);
      if (move) commitMoveRef.current(move, false);
    }, delay);

    return () => {
      clearTimeout(timer);
      setIsThinking(false);
    };
  }, [game, isMultiplayer, gameOver, difficulty]);

  // --- Multijoueur --------------------------------------------------------

  useEffect(() => {
    if (isMultiplayer && isConnected) setNotice(null);
  }, [isMultiplayer, isConnected]);

  useEffect(() => {
    if (opponent) {
      setIsWaitingForOpponent(false);
      setNotice(`${opponent} a rejoint la partie !`);
    }
  }, [opponent]);

  useEffect(() => {
    if (isMultiplayer && isGameStarted) startGame();
  }, [isGameStarted, isMultiplayer, startGame]);

  useEffect(() => {
    if (!socket || !isMultiplayer) return;

    const handleOpponentMove = ({ move }: { move: Move }) => {
      // Le coup passe par le moteur : un coup illégal est signalé et ignoré,
      // au lieu d'être appliqué tel quel comme auparavant.
      const current = gameRef.current;
      const next = playMove(current, move);
      if (next === current) {
        console.warn('Coup adverse refusé par le moteur', move);
        return;
      }
      gameRef.current = next;
      setGame(next);
      setSelectedCell(null);
    };

    socket.on('opponent-move', handleOpponentMove);
    return () => {
      socket.off('opponent-move', handleOpponentMove);
    };
  }, [socket, isMultiplayer]);

  // Annonce la fin de partie une seule fois, à partir du moteur.
  useEffect(() => {
    if (!isMultiplayer || !winner) return;
    if (reportedWinner.current === winner) return;
    reportedWinner.current = winner;
    notifyGameOver(winner);
  }, [isMultiplayer, winner, notifyGameOver]);

  // --- Interaction --------------------------------------------------------

  const handleCellClick = useCallback(
    (row: number, col: number) => {
      if (gameOver) return;
      if (isMultiplayer && game.currentPlayer !== playerType) return;
      if (!isMultiplayer && game.currentPlayer === AI_PLAYER) return;

      // Deuxième clic : la case est-elle une destination valide ?
      if (selectedCell) {
        const target = validMoves.find(
          (move) => move.toRow === row && move.toCol === col,
        );
        if (target) {
          commitMove(target, true);
          return;
        }
        if (selectedCell.row === row && selectedCell.col === col) {
          setSelectedCell(null);
          return;
        }
      }

      const piece = game.board[row][col];
      if (!piece || piece.player !== game.currentPlayer) {
        setSelectedCell(null);
        return;
      }

      // Une pièce sans coup légal ne se sélectionne pas : soit une prise est
      // obligatoire ailleurs, soit elle est bloquée. On le dit une fois.
      if (legalMovesFrom(game, row, col).length === 0) {
        setSelectedCell(null);
        setNotice(
          game.chainFrom
            ? 'La rafle doit se poursuivre avec la même pièce.'
            : mustCapture
              ? 'Une prise est obligatoire avec une autre pièce.'
              : 'Cette pièce ne peut pas jouer.',
        );
        return;
      }

      setNotice(null);
      setSelectedCell({ row, col });
    },
    [
      commitMove,
      game,
      gameOver,
      isMultiplayer,
      mustCapture,
      playerType,
      selectedCell,
      validMoves,
    ],
  );

  const requestHint = useCallback(() => {
    if (gameOver || hintsLeft <= 0) return;
    if (isMultiplayer && game.currentPlayer !== playerType) return;
    if (!isMultiplayer && game.currentPlayer !== HUMAN_PLAYER) return;

    const suggestion = suggestMove(game);
    if (!suggestion) return;

    setHint(suggestion);
    setHintsLeft((left) => left - 1);
    setSelectedCell({ row: suggestion.fromRow, col: suggestion.fromCol });
  }, [game, gameOver, hintsLeft, isMultiplayer, playerType]);

  const resetGame = useCallback(() => startGame(), [startGame]);

  const setVariant = useCallback((next: Variant) => {
    setVariantState(next);
    setGame(createGame(next));
    setSelectedCell(null);
    setHint(null);
    setHintsLeft(MAX_HINTS);
    setNotice(null);
    reportedWinner.current = null;
  }, []);

  const setDifficulty = useCallback((next: Difficulty) => {
    setDifficultyState(next);
  }, []);

  const createRoom = useCallback(
    (username: string) => {
      socketCreateRoom(username);
      setIsWaitingForOpponent(true);
      setNotice("En attente d'un adversaire…");
    },
    [socketCreateRoom],
  );

  const joinRoom = useCallback(
    (room: string, username: string) => {
      socketJoinRoom(room, username);
      setNotice('Connexion à la partie…');
    },
    [socketJoinRoom],
  );

  const setMultiplayerMode = useCallback(
    (enabled: boolean) => {
      setIsMultiplayer(enabled);
      socketSetMultiplayerMode(enabled);
      startGame();
    },
    [socketSetMultiplayerMode, startGame],
  );

  const value = useMemo<GameContextType>(
    () => ({
      board: game.board,
      currentPlayer: game.currentPlayer,
      selectedCell,
      validMoves,
      whitePieces,
      blackPieces,
      gameOver,
      winner,
      status: game.status,
      message,
      lastMove: game.lastMove,
      movableCells,
      mustCapture,
      isThinking,
      hint,
      hintsLeft,
      difficulty,
      variant,
      BOARD_SIZE,
      isMultiplayer,
      roomId,
      playerType,
      opponent,
      isWaitingForOpponent,
      handleCellClick,
      resetGame,
      requestHint,
      setDifficulty,
      setVariant,
      createRoom,
      joinRoom,
      setMultiplayerMode,
    }),
    [
      blackPieces,
      createRoom,
      difficulty,
      game,
      gameOver,
      handleCellClick,
      hint,
      hintsLeft,
      isMultiplayer,
      isThinking,
      isWaitingForOpponent,
      joinRoom,
      message,
      movableCells,
      mustCapture,
      opponent,
      playerType,
      requestHint,
      resetGame,
      roomId,
      selectedCell,
      setDifficulty,
      setMultiplayerMode,
      setVariant,
      validMoves,
      variant,
      whitePieces,
      winner,
    ],
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
};

export default GameContext;
