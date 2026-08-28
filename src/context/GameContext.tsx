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
  DEFAULT_RULES,
  legalMovesFrom,
  movablePositions,
  opponentOf,
  playMove,
  type Board,
  type GameState,
  type Move,
  type Player,
  type Position,
  type RuleSet,
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
import {
  loadMutePreference,
  play,
  preloadSounds,
  setMuted as persistMuted,
  vibrate,
} from '@/lib/sound';
import { shareCard } from '@/lib/shareCard';
import {
  MAX_ATTEMPTS,
  applyResult,
  dailyNumber,
  dailyPuzzle,
  formatShare,
  loadProgress,
  puzzleState,
  saveProgress,
  type DailyPuzzle,
} from '@/lib/daily';
import type { MorpionVariant } from '@/lib/morpion';
import {
  DEFAULT_PIECE_SET,
  findPieceSet,
  loadPieceSet,
  savePieceSet,
  type PieceSet,
  type PieceSetId,
} from '@/lib/pieceSets';
import {
  addEntry,
  clearHistory as clearStoredHistory,
  loadHistory,
  makeEntryId,
  saveHistory,
  type GameResult,
  type HistoryEntry,
} from '@/lib/history';
import { useSocketContext, type NetworkMove } from './SocketContext';
import type { Socket } from 'socket.io-client';

const AI_PLAYER: Player = 'black';
const MAX_HINTS = 3;

/** Où se trouve le joueur dans l'application. */
export type Screen = 'home' | 'game';

/**
 * Les trois façons de jouer. `pass` est le mode le plus proche de la réalité du
 * jeu : deux personnes autour d'un seul appareil.
 */
export type GameMode = 'solo' | 'pass' | 'online' | 'daily';

/** Les jeux proposés. Chacun a son propre plateau et ses propres règles. */
export type GameKind = 'dames' | 'morpion';

/** Suivi de la partie quotidienne : essais consommés et résultat. */
export interface DailyState {
  readonly puzzle: DailyPuzzle;
  readonly attempts: readonly number[];
  readonly solved: boolean;
  readonly finished: boolean;
  readonly streak: number;
}

export interface StartOptions {
  readonly kind?: GameKind;
  /** Règles choisies avant la partie ; les valeurs absentes gardent la coutume. */
  readonly rules?: RuleSet;
  readonly morpionVariant?: MorpionVariant;
  readonly mode: GameMode;
  readonly difficulty?: Difficulty;
  readonly timeControl?: TimeControl;
  readonly variant?: Variant;
}

interface GameContextType {
  screen: Screen;
  kind: GameKind;
  morpionVariant: MorpionVariant;
  /** Règles en vigueur pour la partie de dames en cours. */
  rules: RuleSet;
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
  /**
   * Message digne d'être signalé au joueur : règle contrariée, rafle en cours,
   * arrivée d'un adversaire. L'état permanent — à qui de jouer — est porté par
   * le bandeau du joueur actif, pas par une bulle qui clignoterait à chaque coup.
   */
  alert: string | null;
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
  /** Jeu de pions choisi par le joueur, commun aux deux plateaux. */
  pieceSet: PieceSet;
  setPieceSet: (id: PieceSetId) => void;
  /** Change à chaque nouvelle partie : sert à réinitialiser les animations. */
  gameId: number;
  BOARD_SIZE: number;
  isMultiplayer: boolean;
  roomId: string | null;
  playerType: Player | null;
  opponent: string | null;
  /** Nom de l'adversaire qui vient de quitter la partie, s'il y en a un. */
  opponentLeft: string | null;
  acknowledgeOpponentLeft: () => void;
  isWaitingForOpponent: boolean;
  isGameStarted: boolean;
  /** Accès direct au canal, pour les jeux qui gèrent eux-mêmes leurs échanges. */
  socket: Socket | null;
  makeMove: (move: NetworkMove, nextPlayer: Player) => void;
  /** Vrai tant que la liaison avec le serveur de jeu n'est pas établie. */
  isConnecting: boolean;
  /** Message d'erreur du serveur de jeu, à afficher au joueur. */
  connectionError: string | null;
  bestChain: number;
  series: { white: number; black: number };
  /** Parties conservées sur l'appareil, de la plus récente à la plus ancienne. */
  history: HistoryEntry[];
  clearHistory: () => void;
  /** Consigne une partie terminée : le morpion tient son propre état. */
  recordGame: (entry: Omit<HistoryEntry, 'id'>) => void;
  shareResult: () => void;
  /** Code de salle reçu par lien d'invitation, à proposer au joueur. */
  invitedRoom: string | null;
  daily: DailyState | null;
  handleCellClick: (row: number, col: number) => void;
  retryDaily: () => void;
  shareDaily: () => string;
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

/** Le texte du défi du jour : il rappelle l'objectif, jamais la solution. */
const describeDaily = (state: GameState, daily: DailyState): string => {
  if (daily.finished) {
    return daily.solved
      ? `Trouvé en ${daily.attempts.length} essai${daily.attempts.length > 1 ? 's' : ''} !`
      : `Raté — la meilleure rafle en prenait ${daily.puzzle.target}.`;
  }
  if (state.chainFrom) return 'Continuez, la rafle n’est pas finie !';
  if (state.currentPlayer !== 'white') {
    const last = daily.attempts[daily.attempts.length - 1] ?? 0;
    const left = MAX_ATTEMPTS - daily.attempts.length;
    return `${last} prise${last > 1 ? 's' : ''} sur ${daily.puzzle.target}. Encore ${left} essai${left > 1 ? 's' : ''}.`;
  }
  return `Prenez ${daily.puzzle.target} pièces d’affilée.`;
};

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

  if (state.chainFrom) return 'Rafle en cours — enchaînez la prise suivante !';

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
    isConnected,
    error: socketError,
    roomId,
    roomGame,
    playerType,
    opponent,
    opponentLeft,
    acknowledgeOpponentLeft,
    isGameStarted,
    makeMove: socketMakeMove,
    notifyGameOver,
    createRoom: socketCreateRoom,
    joinRoom: socketJoinRoom,
    setMultiplayerMode: socketSetMultiplayerMode,
  } = useSocketContext();

  const [screen, setScreen] = useState<Screen>('home');
  const [kind, setKind] = useState<GameKind>('dames');
  const [morpionVariant, setMorpionVariant] = useState<MorpionVariant>('moving-heart');
  const [rules, setRules] = useState<RuleSet>(DEFAULT_RULES);
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
  const [pieceSetId, setPieceSetId] = useState<PieceSetId>(DEFAULT_PIECE_SET);
  const [daily, setDaily] = useState<DailyState | null>(null);
  /** Plus longue rafle réussie dans la partie en cours, pour la carte finale. */
  const [bestChain, setBestChain] = useState(0);
  /** Score cumulé des revanches, remis à zéro en quittant la table. */
  const [series, setSeries] = useState({ white: 0, black: 0 });
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  /** Consigne une partie terminée, quel que soit le jeu. */
  const recordGame = useCallback(
    (entry: Omit<HistoryEntry, 'id'>) => {
      setHistory((current) => {
        const next = addEntry(current, {
          ...entry,
          id: makeEntryId(entry.playedAt, entry.game),
        });
        saveHistory(next);
        return next;
      });
    },
    [],
  );

  const gameRef = useRef(game);
  gameRef.current = game;

  const reportedWinner = useRef<Player | null>(null);

  const isMultiplayer = mode === 'online';

  /**
   * Le jeu réellement en cours. En ligne, la salle décide : les deux messages
   * du serveur peuvent arriver dans le même lot, et `kind` accuserait alors un
   * rendu de retard.
   */
  const activeKind: GameKind = roomGame ?? kind;

  useEffect(() => {
    setMutedState(loadMutePreference());
    setPieceSetId(loadPieceSet());
    preloadSounds();
  }, []);

  const pieceSet = useMemo(() => findPieceSet(pieceSetId), [pieceSetId]);

  const setPieceSet = useCallback((id: PieceSetId) => {
    setPieceSetId(id);
    savePieceSet(id);
    play('select');
  }, []);

  /**
   * Un lien d'invitation amène directement dans la salle : on bascule en mode
   * en ligne et on garde le code pour le formulaire, au lieu de demander au
   * joueur de recopier six caractères à la main.
   */
  const [invitedRoom, setInvitedRoom] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const code = new URLSearchParams(window.location.search).get('partie');
    if (!code) return;

    setInvitedRoom(code.toUpperCase());
    socketSetMultiplayerMode(true);
    setMode('online');
    setScreen('game');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Le camp au trait est-il piloté par la personne devant l'écran ? */
  const controllable =
    mode === 'pass'
      ? true
      : mode === 'online'
        ? game.currentPlayer === playerType
        : game.currentPlayer !== AI_PLAYER;

  /*
   * Pendant une rafle, la pièce qui doit reprendre est imposée par les règles :
   * la sélection en découle plutôt que d'être mémorisée à part. Impossible dès
   * lors de la perdre d'un clic à côté et de devoir la re-toucher.
   */
  const selection = useMemo(
    () =>
      game.chainFrom && controllable
        ? { row: game.chainFrom.row, col: game.chainFrom.col }
        : selectedCell,
    [game.chainFrom, controllable, selectedCell],
  );

  const validMoves = useMemo(
    () => (selection ? legalMovesFrom(game, selection.row, selection.col) : []),
    [game, selection],
  );

  const movableCells = useMemo(() => movablePositions(game), [game]);
  const mustCapture = useMemo(() => hasMandatoryCapture(game), [game]);
  const whitePieces = useMemo(() => countPieces(game.board, 'white'), [game.board]);
  const blackPieces = useMemo(() => countPieces(game.board, 'black'), [game.board]);

  const gameOver = game.status.kind !== 'playing' || timeoutLoser !== null;
  const winner = timeoutLoser ? opponentOf(timeoutLoser) : winnerOf(game.status);

  const message =
    notice ??
    (mode === 'daily' && daily
      ? describeDaily(game, daily)
      : describe(game, mode, playerType, isThinking, timeoutLoser));

  const alert =
    notice ??
    (game.status.kind === 'playing' && game.chainFrom
      ? 'Rafle en cours — continuez !'
      : game.status.kind === 'playing' && hasMandatoryCapture(game)
        ? 'Prise obligatoire'
        : null);

  /**
   * Autour du plateau, on ne fait pas pivoter la planche : les deux joueurs
   * sont assis de part et d'autre et gardent chacun leur point de vue, comme
   * sur une vraie table. En ligne, le plateau est orienté une fois pour toutes
   * selon la couleur reçue, pour que chacun ait ses pièces devant soi.
   */
  const isFlipped = mode === 'online' && playerType === 'black';

  // --- Démarrage et arrêt -------------------------------------------------

  const beginGame = useCallback((options: StartOptions) => {
    // Sans jeu explicite, on garde celui en cours : l'effet de démarrage d'une
    // partie en ligne appelle `beginGame` sans le préciser, et ramenait sinon
    // les deux joueurs aux dames au moment même où la partie commençait.
    if (options.kind) setKind(options.kind);
    if (options.morpionVariant) setMorpionVariant(options.morpionVariant);
    const nextRules = options.rules ?? rules;
    if (options.rules) setRules(options.rules);
    const nextVariant = options.variant ?? 'classic';

    // Le défi du jour ne part pas d'une position de départ mais du puzzle du
    // jour, identique pour tous les joueurs.
    let fresh: GameState;
    if (options.mode === 'daily') {
      const progress = loadProgress();
      const puzzle = dailyPuzzle(dailyNumber());
      fresh = puzzleState(puzzle.board);
      setDaily((current) =>
        current && current.puzzle.number === puzzle.number
          ? current
          : {
              puzzle,
              attempts: [],
              solved: false,
              finished: false,
              streak: progress.streak,
            },
      );
    } else {
      fresh = createGame(nextVariant, 'white', nextRules);
      setDaily(null);
    }

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
    setBestChain(0);
    reportedWinner.current = null;

    setClock(createClock(options.timeControl ?? 'none', Date.now()));
    setScreen('game');
  }, [rules]);

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
    setSeries({ white: 0, black: 0 });
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

  useEffect(() => {
    if (game.chainLength > bestChain) setBestChain(game.chainLength);
  }, [game.chainLength, bestChain]);

  // Le score de la série et l'historique ne bougent qu'une fois par partie.
  const countedGame = useRef(0);
  useEffect(() => {
    if (!gameOver || mode === 'daily') return;
    if (countedGame.current === gameId) return;
    countedGame.current = gameId;

    if (winner) {
      setSeries((current) => ({ ...current, [winner]: current[winner] + 1 }));
    }

    // En duel local, personne n'est « le joueur » : on note le camp vainqueur.
    const mine: Player = mode === 'online' ? (playerType ?? 'white') : 'white';
    const result: GameResult = !winner ? 'draw' : winner === mine ? 'win' : 'loss';

    recordGame({
      game: 'dames',
      mode,
      result,
      opponent:
        mode === 'solo'
          ? difficulty
          : mode === 'online'
            ? (opponent ?? 'Adversaire')
            : 'Duel local',
      playedAt: Date.now(),
      detail: bestChain >= 2 ? `rafle de ${bestChain}` : undefined,
    });
  }, [
    gameOver,
    winner,
    gameId,
    mode,
    playerType,
    difficulty,
    opponent,
    bestChain,
    recordGame,
  ]);

  const shareResult = useCallback(() => {
    const names =
      mode === 'solo'
        ? { white: 'Vous', black: 'L’adversaire' }
        : { white: 'Blancs', black: 'Noirs' };

    void shareCard({
      board: game.board,
      winner,
      isDraw: game.status.kind === 'draw',
      whiteName: names.white,
      blackName: names.black,
      whitePieces,
      blackPieces,
      bestChain,
    });
  }, [bestChain, blackPieces, game.board, game.status.kind, mode, whitePieces, winner]);

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
    (move: Move, byPlayer: boolean) => {
      const current = gameRef.current;
      const next = playMove(current, move);
      if (next === current) return;

      gameRef.current = next;
      setGame(next);

      /*
       * Pendant une rafle, la pièce reste sélectionnée sur sa nouvelle case :
       * le joueur enchaîne les prises en désignant directement les cases
       * d'arrivée, au lieu de re-toucher sa pièce avant chacune d'elles.
       * La sélection ne suit que les coups joués à la main — celle de
       * l'adversaire artificiel n'aurait aucun sens à l'écran.
       */
      setSelectedCell(
        byPlayer && next.chainFrom
          ? { row: next.chainFrom.row, col: next.chainFrom.col }
          : null,
      );
      setHint(null);
      setNotice(null);

      // La pendule ne bascule qu'au vrai changement de trait : une rafle laisse
      // le temps courir chez celui qui enchaîne, comme sur une pendule réelle.
      if (next.currentPlayer !== current.currentPlayer) {
        setClock((clockState) =>
          switchClock(clockState, current.currentPlayer, next.currentPlayer, Date.now()),
        );
      }

      if (byPlayer && isMultiplayer) {
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

  // --- Défi du jour -------------------------------------------------------

  /**
   * Un essai s'achève dès que le trait quitte les blancs : en défi il n'y a pas
   * d'adversaire, seule compte la longueur de la rafle qu'on vient de jouer.
   */
  useEffect(() => {
    if (mode !== 'daily' || !daily || daily.finished) return;
    if (!game.lastMove || game.currentPlayer === 'white') return;

    const taken = game.chainLength;
    const attempts = [...daily.attempts, taken];
    const solved = taken >= daily.puzzle.target;
    const finished = solved || attempts.length >= MAX_ATTEMPTS;

    let streak = daily.streak;
    if (finished) {
      const progress = applyResult(loadProgress(), daily.puzzle.number, solved);
      saveProgress(progress);
      streak = progress.streak;
      play(solved ? 'win' : 'lose');
    }

    setDaily({ ...daily, attempts, solved, finished, streak });
  }, [game, mode, daily]);

  const retryDaily = useCallback(() => {
    if (!daily || daily.finished) return;
    const fresh = puzzleState(daily.puzzle.board);
    gameRef.current = fresh;
    setGame(fresh);
    setGameId((id) => id + 1);
    setSelectedCell(null);
    setHint(null);
    setNotice(null);
  }, [daily]);

  const shareDaily = useCallback(() => {
    if (!daily) return '';
    return formatShare(
      {
        number: daily.puzzle.number,
        attempts: daily.attempts,
        target: daily.puzzle.target,
        solved: daily.solved,
      },
      daily.streak,
    );
  }, [daily]);

  // --- Multijoueur --------------------------------------------------------

  useEffect(() => {
    if (opponent) {
      setIsWaitingForOpponent(false);
      setNotice(`${opponent} a rejoint la partie !`);
    }
  }, [opponent]);

  useEffect(() => {
    if (isMultiplayer && isGameStarted && activeKind === 'dames') {
      beginGame({ mode: 'online', timeControl: clock.control, variant });
    }
    // `clock.control` et `variant` sont lus au démarrage, sans relancer l'effet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGameStarted, isMultiplayer, beginGame, activeKind]);

  useEffect(() => {
    // Le morpion en ligne gère ses propres échanges : ce moteur-ci ne doit pas
    // tenter d'appliquer un coup qui ne lui est pas destiné.
    if (!socket || !isMultiplayer || activeKind !== 'dames') return;

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
  }, [socket, isMultiplayer, activeKind]);

  useEffect(() => {
    if (!isMultiplayer || !winner || activeKind !== 'dames') return;
    if (reportedWinner.current === winner) return;
    reportedWinner.current = winner;
    notifyGameOver(winner);
  }, [isMultiplayer, winner, notifyGameOver, activeKind]);

  // --- Interaction --------------------------------------------------------

  /** Le joueur peut-il agir sur le plateau en ce moment ? */
  const canPlay = useCallback(
    (player: Player) => {
      if (gameOver) return false;
      if (mode === 'solo' || mode === 'daily') return player !== AI_PLAYER;
      if (mode === 'online') return player === playerType;
      return true;
    },
    [gameOver, mode, playerType],
  );

  const handleCellClick = useCallback(
    (row: number, col: number) => {
      if (!canPlay(game.currentPlayer)) return;

      if (selection) {
        const target = validMoves.find(
          (move) => move.toRow === row && move.toCol === col,
        );
        if (target) {
          commitMove(target, true);
          return;
        }

        // En pleine rafle, aucun clic ne libère la pièce : elle doit reprendre.
        if (game.chainFrom) {
          play('illegal');
          setNotice('La rafle doit se poursuivre avec la même pièce.');
          return;
        }

        if (selection.row === row && selection.col === col) {
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
    [canPlay, commitMove, game, mustCapture, selection, validMoves],
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
      // La salle porte le jeu choisi : celui qui rejoindra ouvrira le même.
      socketCreateRoom(username, kind);
      setIsWaitingForOpponent(true);
      setNotice("En attente d'un adversaire…");
    },
    [socketCreateRoom, kind],
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
      kind: activeKind,
      morpionVariant,
      rules,
      mode,
      board: game.board,
      currentPlayer: game.currentPlayer,
      selectedCell: selection,
      validMoves,
      whitePieces,
      blackPieces,
      gameOver,
      winner,
      status: game.status,
      message,
      lastMove: game.lastMove,
      alert,
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
      pieceSet,
      setPieceSet,
      gameId,
      BOARD_SIZE,
      isMultiplayer,
      roomId,
      playerType,
      opponent,
      opponentLeft,
      acknowledgeOpponentLeft,
      isWaitingForOpponent,
      isGameStarted,
      socket,
      makeMove: socketMakeMove,
      isConnecting: isMultiplayer && !isConnected,
      connectionError: socketError,
      bestChain,
      series,
      history,
      clearHistory: () => {
        clearStoredHistory();
        setHistory([]);
      },
      recordGame,
      shareResult,
      invitedRoom,
      daily,
      handleCellClick,
      retryDaily,
      shareDaily,
      startGame,
      goHome,
      resetGame,
      requestHint,
      toggleMute,
      createRoom,
      joinRoom,
    }),
    [
      activeKind,
      alert,
      bestChain,
      morpionVariant,
      blackPieces,
      clock,
      createRoom,
      daily,
      difficulty,
      game,
      gameId,
      gameOver,
      goHome,
      handleCellClick,
      hint,
      hintsLeft,
      isFlipped,
      invitedRoom,
      isConnected,
      isGameStarted,
      isMultiplayer,
      socket,
      socketMakeMove,
      isThinking,
      socketError,
      isWaitingForOpponent,
      joinRoom,
      message,
      mode,
      movableCells,
      muted,
      mustCapture,
      acknowledgeOpponentLeft,
      opponent,
      opponentLeft,
      pieceSet,
      playerType,
      requestHint,
      rules,
      setPieceSet,
      resetGame,
      retryDaily,
      roomId,
      screen,
      history,
      recordGame,
      selection,
      series,
      shareDaily,
      shareResult,
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
