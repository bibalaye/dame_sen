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
  opponentOf,
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
import {
  createClock,
  flaggedPlayer,
  startClock,
  stopClock,
  switchClock,
  tickClock,
  type ClockState,
  type TimeControl,
} from '@/lib/clock';
import { loadMutePreference, play, setMuted as persistMuted, vibrate } from '@/lib/sound';
import { useSocketContext } from './SocketContext';

const AI_PLAYER: Player = 'black';
const MAX_HINTS = 3;

/** Où se trouve le joueur dans l'application. */
export type Screen = 'home' | 'game';

/**
 * Les trois façons de jouer. `pass` est le mode le plus proche de la réalité du
 * jeu : deux personnes autour d'un seul appareil.
 */
export type GameMode = 'solo' | 'pass' | 'online';

export interface StartOptions {
  readonly mode: GameMode;
  readonly difficulty?: Difficulty;
  readonly timeControl?: TimeControl;
  readonly variant?: Variant;
}

interface GameContextType {
  screen: Screen;
  mode: GameMode;
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
  movableCells: Position[];
  mustCapture: boolean;
  /** Prises enchaînées par le tour en cours, pour le bandeau de rafle. */
  chainLength: number;
  isThinking: boolean;
  hint: Move | null;
  hintsLeft: number;
  difficulty: Difficulty;
  variant: Variant;
  clock: ClockState;
  /** Vrai quand le plateau doit être vu depuis le camp noir. */
  isFlipped: boolean;
  muted: boolean;
  /** Change à chaque nouvelle partie : sert à réinitialiser les animations. */
  gameId: number;
  BOARD_SIZE: number;
  isMultiplayer: boolean;
  roomId: string | null;
  playerType: Player | null;
  opponent: string | null;
  isWaitingForOpponent: boolean;
  handleCellClick: (row: number, col: number) => void;
  startGame: (options: StartOptions) => void;
  goHome: () => void;
  resetGame: () => void;
  requestHint: () => void;
  toggleMute: () => void;
  createRoom: (username: string) => void;
  joinRoom: (roomId: string, username: string) => void;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

export const useGameContext = () => {
  const context = useContext(GameContext);
  if (!context) {
    throw new Error('useGameContext must be used within a GameProvider');
  }
  return context;
};

const winnerOf = (status: Status): Player | null =>
  status.kind === 'win' ? status.winner : null;

const sideName = (player: Player) => (player === 'white' ? 'Blanc' : 'Noir');

/** Le texte affiché sous le plateau, déduit du seul état du jeu. */
const describe = (
  state: GameState,
  mode: GameMode,
  playerType: Player | null,
  isThinking: boolean,
  timeoutLoser: Player | null,
): string => {
  if (timeoutLoser) {
    return `Temps écoulé — le joueur ${sideName(opponentOf(timeoutLoser))} gagne !`;
  }
  if (state.status.kind === 'win') {
    const side = sideName(state.status.winner);
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

  const mustTake = hasMandatoryCapture(state);

  if (mode === 'pass') {
    return mustTake
      ? `Aux ${sideName(state.currentPlayer).toLowerCase()}s — prise obligatoire.`
      : `Au tour des ${sideName(state.currentPlayer).toLowerCase()}s.`;
  }

  if (mode === 'online') {
    return state.currentPlayer === playerType
      ? mustTake
        ? 'À vous — une prise est obligatoire.'
        : 'À vous de jouer.'
      : "En attente de l'adversaire…";
  }

  if (state.currentPlayer === AI_PLAYER) {
    return isThinking ? 'Votre adversaire réfléchit' : 'Au tour des noirs.';
  }
  return mustTake ? 'À vous — une prise est obligatoire.' : 'À vous de jouer.';
};

export const GameProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const {
    socket,
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

  const [screen, setScreen] = useState<Screen>('home');
  const [mode, setMode] = useState<GameMode>('solo');
  const [variant, setVariant] = useState<Variant>('classic');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [game, setGame] = useState<GameState>(() => createGame('classic'));
  const [gameId, setGameId] = useState(1);
  const [selectedCell, setSelectedCell] = useState<Position | null>(null);
  const [isWaitingForOpponent, setIsWaitingForOpponent] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [hint, setHint] = useState<Move | null>(null);
  const [hintsLeft, setHintsLeft] = useState(MAX_HINTS);
  const [notice, setNotice] = useState<string | null>(null);
  const [clock, setClock] = useState<ClockState>(() => createClock('none', 0));
  const [timeoutLoser, setTimeoutLoser] = useState<Player | null>(null);
  const [muted, setMutedState] = useState(false);

  const gameRef = useRef(game);
  gameRef.current = game;

  const reportedWinner = useRef<Player | null>(null);

  const isMultiplayer = mode === 'online';

  useEffect(() => {
    setMutedState(loadMutePreference());
  }, []);

  const validMoves = useMemo(
    () =>
      selectedCell ? legalMovesFrom(game, selectedCell.row, selectedCell.col) : [],
    [game, selectedCell],
  );

  const movableCells = useMemo(() => movablePositions(game), [game]);
  const mustCapture = useMemo(() => hasMandatoryCapture(game), [game]);
  const whitePieces = useMemo(() => countPieces(game.board, 'white'), [game.board]);
  const blackPieces = useMemo(() => countPieces(game.board, 'black'), [game.board]);

  const gameOver = game.status.kind !== 'playing' || timeoutLoser !== null;
  const winner = timeoutLoser ? opponentOf(timeoutLoser) : winnerOf(game.status);

  const message =
    notice ?? describe(game, mode, playerType, isThinking, timeoutLoser);

  /**
   * En mode « autour du plateau », chacun doit voir ses pièces devant soi : le
   * plateau pivote quand les noirs prennent la main. En ligne, il est orienté
   * une fois pour toutes selon la couleur du joueur.
   */
  const isFlipped =
    mode === 'pass'
      ? game.currentPlayer === 'black'
      : mode === 'online' && playerType === 'black';

  // --- Démarrage et arrêt -------------------------------------------------

  const beginGame = useCallback((options: StartOptions) => {
    const nextVariant = options.variant ?? 'classic';
    const fresh = createGame(nextVariant);

    setMode(options.mode);
    setVariant(nextVariant);
    if (options.difficulty) setDifficulty(options.difficulty);

    setGame(fresh);
    gameRef.current = fresh;
    setGameId((id) => id + 1);
    setSelectedCell(null);
    setIsThinking(false);
    setHint(null);
    setHintsLeft(MAX_HINTS);
    setNotice(null);
    setTimeoutLoser(null);
    reportedWinner.current = null;

    setClock(createClock(options.timeControl ?? 'none', Date.now()));
    setScreen('game');
  }, []);

  const startGame = useCallback(
    (options: StartOptions) => {
      socketSetMultiplayerMode(options.mode === 'online');
      beginGame(options);
    },
    [beginGame, socketSetMultiplayerMode],
  );

  const resetGame = useCallback(() => {
    beginGame({ mode, difficulty, timeControl: clock.control, variant });
  }, [beginGame, clock.control, difficulty, mode, variant]);

  const goHome = useCallback(() => {
    socketSetMultiplayerMode(false);
    setScreen('home');
    setIsWaitingForOpponent(false);
    setNotice(null);
  }, [socketSetMultiplayerMode]);

  const toggleMute = useCallback(() => {
    setMutedState((current) => {
      persistMuted(!current);
      return !current;
    });
  }, []);

  // --- Sons ---------------------------------------------------------------

  // Un son par coup joué, choisi sur ce que le moteur rapporte de ce coup.
  useEffect(() => {
    if (!game.lastMove) return;

    if (game.lastPromotion) {
      play('promote');
      vibrate([12, 40, 18]);
    } else if (game.lastCapture) {
      play('capture', game.chainLength - 1);
      vibrate(game.chainLength > 1 ? [10, 30, 14] : 12);
    } else {
      play('move');
    }
  }, [game.lastMove, game.lastCapture, game.lastPromotion, game.chainLength]);

  useEffect(() => {
    if (!gameOver) return;
    if (game.status.kind === 'draw') return;

    const humanSide = mode === 'online' ? playerType : 'white';
    if (mode === 'pass') {
      play('win');
    } else if (winner && winner === humanSide) {
      play('win');
    } else {
      play('lose');
    }
  }, [gameOver, winner, mode, playerType, game.status.kind]);

  // --- Pendule ------------------------------------------------------------

  useEffect(() => {
    if (clock.control === 'none' || !clock.running || gameOver) return;

    const timer = window.setInterval(() => {
      setClock((current) => tickClock(current, Date.now()));
    }, 100);

    return () => window.clearInterval(timer);
  }, [clock.control, clock.running, gameOver]);

  useEffect(() => {
    const flagged = flaggedPlayer(clock);
    if (flagged && !timeoutLoser && game.status.kind === 'playing') {
      setTimeoutLoser(flagged);
    }
  }, [clock, timeoutLoser, game.status.kind]);

  // Arrête la pendule dès que la partie est terminée.
  useEffect(() => {
    if (gameOver && clock.running) {
      setClock((current) => stopClock(current, Date.now()));
    }
  }, [gameOver, clock.running]);

  // --- Jouer un coup ------------------------------------------------------

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

      // La pendule ne bascule qu'au vrai changement de trait : une rafle laisse
      // le temps courir chez celui qui enchaîne, comme sur une pendule réelle.
      if (next.currentPlayer !== current.currentPlayer) {
        setClock((clockState) =>
          switchClock(clockState, current.currentPlayer, next.currentPlayer, Date.now()),
        );
      }

      if (broadcast && isMultiplayer) {
        socketMakeMove(move, next.currentPlayer);
      }
    },
    [isMultiplayer, socketMakeMove],
  );

  const commitMoveRef = useRef(commitMove);
  commitMoveRef.current = commitMove;

  // Le premier coup lance la pendule.
  useEffect(() => {
    if (screen !== 'game' || clock.control === 'none') return;
    if (clock.running || gameOver || game.lastMove) return;
    setClock((current) => startClock(current, game.currentPlayer, Date.now()));
  }, [screen, clock.control, clock.running, gameOver, game.lastMove, game.currentPlayer]);

  // --- Tour de l'adversaire artificiel ------------------------------------

  useEffect(() => {
    if (mode !== 'solo' || gameOver || screen !== 'game') return;
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
  }, [game, mode, gameOver, difficulty, screen]);

  // --- Multijoueur --------------------------------------------------------

  useEffect(() => {
    if (opponent) {
      setIsWaitingForOpponent(false);
      setNotice(`${opponent} a rejoint la partie !`);
    }
  }, [opponent]);

  useEffect(() => {
    if (isMultiplayer && isGameStarted) {
      beginGame({ mode: 'online', timeControl: clock.control, variant });
    }
    // `clock.control` et `variant` sont lus au démarrage, sans relancer l'effet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGameStarted, isMultiplayer, beginGame]);

  useEffect(() => {
    if (!socket || !isMultiplayer) return;

    const handleOpponentMove = ({ move }: { move: Move }) => {
      const current = gameRef.current;
      const next = playMove(current, move);
      if (next === current) {
        console.warn('Coup adverse refusé par le moteur', move);
        return;
      }
      gameRef.current = next;
      setGame(next);
      setSelectedCell(null);

      if (next.currentPlayer !== current.currentPlayer) {
        setClock((clockState) =>
          switchClock(clockState, current.currentPlayer, next.currentPlayer, Date.now()),
        );
      }
    };

    socket.on('opponent-move', handleOpponentMove);
    return () => {
      socket.off('opponent-move', handleOpponentMove);
    };
  }, [socket, isMultiplayer]);

  useEffect(() => {
    if (!isMultiplayer || !winner) return;
    if (reportedWinner.current === winner) return;
    reportedWinner.current = winner;
    notifyGameOver(winner);
  }, [isMultiplayer, winner, notifyGameOver]);

  // --- Interaction --------------------------------------------------------

  /** Le joueur peut-il agir sur le plateau en ce moment ? */
  const canPlay = useCallback(
    (player: Player) => {
      if (gameOver) return false;
      if (mode === 'solo') return player !== AI_PLAYER;
      if (mode === 'online') return player === playerType;
      return true;
    },
    [gameOver, mode, playerType],
  );

  const handleCellClick = useCallback(
    (row: number, col: number) => {
      if (!canPlay(game.currentPlayer)) return;

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

      if (legalMovesFrom(game, row, col).length === 0) {
        setSelectedCell(null);
        play('illegal');
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
    [canPlay, commitMove, game, mustCapture, selectedCell, validMoves],
  );

  const requestHint = useCallback(() => {
    if (hintsLeft <= 0 || !canPlay(game.currentPlayer)) return;

    const suggestion = suggestMove(game);
    if (!suggestion) return;

    setHint(suggestion);
    setHintsLeft((left) => left - 1);
    setSelectedCell({ row: suggestion.fromRow, col: suggestion.fromCol });
  }, [canPlay, game, hintsLeft]);

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

  const value = useMemo<GameContextType>(
    () => ({
      screen,
      mode,
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
      chainLength: game.chainLength,
      isThinking,
      hint,
      hintsLeft,
      difficulty,
      variant,
      clock,
      isFlipped,
      muted,
      gameId,
      BOARD_SIZE,
      isMultiplayer,
      roomId,
      playerType,
      opponent,
      isWaitingForOpponent,
      handleCellClick,
      startGame,
      goHome,
      resetGame,
      requestHint,
      toggleMute,
      createRoom,
      joinRoom,
    }),
    [
      blackPieces,
      clock,
      createRoom,
      difficulty,
      game,
      gameId,
      gameOver,
      goHome,
      handleCellClick,
      hint,
      hintsLeft,
      isFlipped,
      isMultiplayer,
      isThinking,
      isWaitingForOpponent,
      joinRoom,
      message,
      mode,
      movableCells,
      muted,
      mustCapture,
      opponent,
      playerType,
      requestHint,
      resetGame,
      roomId,
      screen,
      selectedCell,
      startGame,
      toggleMute,
      validMoves,
      variant,
      whitePieces,
      winner,
    ],
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
};

export default GameContext;
