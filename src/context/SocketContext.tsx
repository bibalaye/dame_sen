'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import { io, Socket } from 'socket.io-client';
import type { Board, Move as DamesMove, Player } from '@/lib/engine';
import type { MorpionMove } from '@/lib/morpion';
import type { LudoMove } from '@/lib/ludo';

/**
 * Charge utile transmise pour une action de Ludo sur le réseau.
 */
export type LudoNetworkPayload =
  | { readonly type: 'ludo-roll'; readonly dice: readonly number[] }
  | { readonly type: 'ludo-move'; readonly move: LudoMove };

/**
 * Un coup transmis sur le réseau. Le serveur ne fait que relayer : il n'a pas
 * à connaître les règles, et la même salle sert donc aux trois jeux.
 */
export type NetworkMove = DamesMove | MorpionMove | LudoNetworkPayload;

/** Le jeu auquel se joue une salle. */
export type RoomGame = 'dames' | 'morpion' | 'ludo';

/** Port sur lequel `npm run server` expose le serveur temps réel. */
const REALTIME_PORT = '5000';

/**
 * Adresse du serveur temps réel.
 *
 * En production, la page et les websockets sont servies par la même origine.
 * En développement, `npm run dev` ne lance que Next : le serveur socket.io vit
 * dans server.js, sur son propre port. Sans cette bascule, le client tentait de
 * se connecter à une origine qui n'écoute pas, et le multijoueur échouait sans
 * explication.
 */
const resolveServerUrl = (): string => {
  const configured = process.env.NEXT_PUBLIC_SOCKET_URL;
  if (configured) return configured;
  if (typeof window === 'undefined') return '';

  const { protocol, hostname, port } = window.location;
  if (process.env.NODE_ENV === 'development' && port && port !== REALTIME_PORT) {
    return `${protocol}//${hostname}:${REALTIME_PORT}`;
  }
  return '';
};

/** Délai au-delà duquel on considère le serveur injoignable. */
const CONNECT_TIMEOUT_MS = 8000;

/**
 * Le jeu en ligne repose sur une connexion permanente (WebSocket), que les
 * hébergements « sans serveur » — Vercel, Netlify et consorts — ne fournissent
 * pas : ils exécutent des fonctions éphémères, sans état partagé entre deux
 * requêtes. Le service temps réel doit donc tourner ailleurs, et son adresse
 * être donnée par `NEXT_PUBLIC_SOCKET_URL`.
 *
 * Quand la page est servie par `server.js` lui-même, l'origine suffit et la
 * variable est inutile : on ne peut donc pas trancher à la compilation, mais on
 * sait dire pourquoi la connexion échoue.
 */
const realtimeHint = (): string => {
  if (process.env.NODE_ENV === 'development') {
    return 'Le serveur de jeu ne répond pas. Lancez « npm run server » dans un second terminal, ou jouez à deux sur cet appareil.';
  }
  if (!process.env.NEXT_PUBLIC_SOCKET_URL) {
    return 'Le jeu en ligne n’est pas disponible sur cet hébergement : il demande un serveur temps réel, qui doit être déployé à part. Les autres modes fonctionnent normalement.';
  }
  return 'Le serveur de jeu est injoignable pour le moment. Réessayez dans un instant, ou jouez à deux sur cet appareil.';
};

// Define the shape of our socket context
interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  roomId: string | null;
  /** Jeu de la salle rejointe : celui qui entre doit ouvrir le même plateau. */
  roomGame: RoomGame | null;
  playerType: Player | null;
  opponent: string | null;
  /** Nom de l'adversaire qui vient de partir, tant que le joueur n'a pas vu. */
  opponentLeft: string | null;
  acknowledgeOpponentLeft: () => void;
  isMultiplayer: boolean;
  isRoomCreator: boolean;
  isGameStarted: boolean;
  error: string | null;
  createRoom: (username: string, game: RoomGame) => void;
  joinRoom: (roomId: string, username: string) => void;
  makeMove: (move: NetworkMove, nextPlayer: Player) => void;
  syncGameState: (board: Board, currentPlayer: Player) => void;
  notifyGameOver: (winner: Player) => void;
  setMultiplayerMode: (isMultiplayer: boolean) => void;
  /** L'adversaire a demandé une revanche et attend une réponse. */
  rematchOffered: boolean;
  /** Notre demande est partie : on attend que l'autre réponde. */
  rematchAsked: boolean;
  /** L'adversaire a refusé, tant que le joueur ne l'a pas vu. */
  rematchDeclined: boolean;
  requestRematch: () => void;
  declineRematch: () => void;
  clearRematch: () => void;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export const useSocketContext = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocketContext must be used within a SocketProvider');
  }
  return context;
};

interface SocketProviderProps {
  children: ReactNode;
}

export const SocketProvider: React.FC<SocketProviderProps> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [roomGame, setRoomGame] = useState<RoomGame | null>(null);
  /** Le camp reçu, lisible dans les abonnements sans avoir à les réinstaller. */
  const playerTypeRef = useRef<Player | null>(null);
  const [playerType, setPlayer] = useState<Player | null>(null);
  const [opponent, setOpponent] = useState<string | null>(null);
  const [opponentLeft, setOpponentLeft] = useState<string | null>(null);
  /** Le nom survit au départ : sans lui, on ne saurait plus qui a quitté. */
  const opponentRef = useRef<string | null>(null);
  const [isMultiplayer, setIsMultiplayer] = useState(false);
  const [isRoomCreator, setIsRoomCreator] = useState(false);
  const [isGameStarted, setIsGameStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rematchOffered, setRematchOffered] = useState(false);
  const [rematchAsked, setRematchAsked] = useState(false);
  const [rematchDeclined, setRematchDeclined] = useState(false);

  // Initialize socket connection when multiplayer mode is enabled
  useEffect(() => {
    if (isMultiplayer && !socket) {
      const url = resolveServerUrl();
      // Le repli en polling permet de se connecter là où les websockets sont
      // filtrés — proxys d'entreprise, certains réseaux mobiles.
      const socketInstance = io(url, {
        transports: ['websocket', 'polling'],
        autoConnect: true,
      });

      setSocket(socketInstance);
      setError(null);

      const timeout = setTimeout(() => {
        if (!socketInstance.connected) {
          setError(realtimeHint());
        }
      }, CONNECT_TIMEOUT_MS);

      socketInstance.on('connect', () => {
        setIsConnected(true);
        setError(null);
        clearTimeout(timeout);
      });

      socketInstance.on('disconnect', () => {
        setIsConnected(false);
      });

      let failures = 0;
      socketInstance.on('connect_error', (cause) => {
        setIsConnected(false);
        // Deux échecs consécutifs : inutile de faire patienter huit secondes.
        if (++failures >= 2) {
          clearTimeout(timeout);
          setError(realtimeHint());
        }
        console.warn('Connexion au serveur de jeu impossible :', cause.message);
      });

      socketInstance.on('error', (data) => {
        setError(data?.message ?? 'Erreur du serveur de jeu.');
      });

      return () => {
        clearTimeout(timeout);
        socketInstance.disconnect();
        setSocket(null);
        setIsConnected(false);
      };
    }
  }, [isMultiplayer]);

  // Set up game room event listeners
  useEffect(() => {
    if (!socket) return;

    // Room created successfully
    socket.on('room-created', (data) => {
      setRoomId(data.roomId);
      setPlayer(data.player);
      playerTypeRef.current = data.player;
      setRoomGame(data.game ?? 'dames');
      setIsRoomCreator(true);
    });

    // Room joined successfully
    socket.on('room-joined', (data) => {
      setRoomId(data.roomId);
      setPlayer(data.player);
      playerTypeRef.current = data.player;
      // C'est la salle qui impose le jeu, pas le choix fait sur l'accueil.
      setRoomGame(data.game ?? 'dames');
    });

    // Opponent joined the room
    socket.on('opponent-joined', (data) => {
      setOpponent(data.username);
      opponentRef.current = data.username;
      setOpponentLeft(null);
      console.log(`Opponent joined: ${data.username}`);
    });

    // Game started
    socket.on('game-start', (data) => {
      if (data?.game) setRoomGame(data.game);

      // « opponent-joined » n'est envoyé qu'à celui qui attendait : celui qui
      // vient d'entrer ne connaîtrait jamais le nom d'en face sans ceci.
      const others = (data?.players ?? []).filter(
        (entry: { player: Player; username: string }) =>
          entry.player !== playerTypeRef.current,
      );
      if (others[0]?.username) {
        setOpponent(others[0].username);
        opponentRef.current = others[0].username;
      }
      setOpponentLeft(null);

      setIsGameStarted(true);
    });

    // Opponent made a move
    socket.on('opponent-move', (data) => {
      // This will be handled by the GameContext
      console.log('Opponent move:', data.move);
    });

    // Game state updated
    socket.on('game-state-updated', (data) => {
      // This will be handled by the GameContext
      console.log('Game state updated', data);
    });

    // Game over
    socket.on('game-over', (data) => {
      console.log('Game over. Winner:', data.winner);
    });

    // Opponent disconnected
    // Un départ doit se voir : sans cela, le joueur attend un coup qui ne
    // viendra jamais, sans comprendre pourquoi.
    socket.on('opponent-disconnected', (data?: { player?: Player }) => {
      setOpponentLeft(opponentRef.current ?? 'Votre adversaire');
      setOpponent(null);
      opponentRef.current = null;
      setIsGameStarted(false);
      setRematchOffered(false);
      setRematchAsked(false);

      // La place libérée remet celui qui reste aux blancs : sans cela, le
      // prochain arrivant jouerait la même couleur que lui.
      if (data?.player) {
        playerTypeRef.current = data.player;
        setPlayer(data.player);
      }
    });

    // --- Revanche ---------------------------------------------------------

    socket.on('rematch-offered', () => {
      setRematchOffered(true);
      setRematchDeclined(false);
    });

    socket.on('rematch-declined', () => {
      setRematchDeclined(true);
      setRematchAsked(false);
      setRematchOffered(false);
    });

    // La nouvelle couleur vient du serveur : elle s'échange à chaque revanche,
    // et le client ne peut pas la deviner.
    socket.on(
      'rematch-start',
      (data: { player: Player; players?: { player: Player; username: string }[] }) => {
        playerTypeRef.current = data.player;
        setPlayer(data.player);

        const autre = data.players?.find((entry) => entry.player !== data.player);
        if (autre?.username) {
          setOpponent(autre.username);
          opponentRef.current = autre.username;
        }

        setRematchOffered(false);
        setRematchAsked(false);
        setRematchDeclined(false);
        setIsGameStarted(true);
      },
    );

    // Clean up listeners on unmount
    return () => {
      socket.off('room-created');
      socket.off('room-joined');
      socket.off('opponent-joined');
      socket.off('game-start');
      socket.off('opponent-move');
      socket.off('game-state-updated');
      socket.off('game-over');
      socket.off('opponent-disconnected');
      socket.off('rematch-offered');
      socket.off('rematch-declined');
      socket.off('rematch-start');
    };
  }, [socket]);

  /**
   * Crée une salle.
   *
   * On n'exige plus que la connexion soit déjà établie : socket.io met les
   * émissions en attente et les envoie dès la poignée de main terminée. Refuser
   * le clic parce que la connexion prenait une demi-seconde de plus était la
   * cause de l'échec « Socket not connected ».
   */
  const createRoom = (username: string, game: RoomGame) => {
    if (!socket) {
      setError('Le mode en ligne n’est pas encore prêt, réessayez.');
      return;
    }
    setError(null);
    socket.emit('create-room', { username, game });
  };

  /**
   * Demande une revanche. Le mécanisme est symétrique : proposer et accepter
   * sont le même geste, et la partie repart quand les deux l'ont fait.
   */
  const requestRematch = () => {
    if (!socket || !roomId) return;
    setRematchDeclined(false);
    setRematchAsked(true);
    socket.emit('rematch-request', { roomId });
  };

  const declineRematch = () => {
    if (!socket || !roomId) return;
    setRematchOffered(false);
    socket.emit('rematch-decline', { roomId });
  };

  /** Efface le refus une fois montré, pour ne pas le réafficher sans fin. */
  const clearRematch = () => setRematchDeclined(false);

  const joinRoom = (roomId: string, username: string) => {
    if (!socket) {
      setError('Le mode en ligne n’est pas encore prêt, réessayez.');
      return;
    }
    setError(null);
    socket.emit('join-room', { roomId, username });
  };

  /**
   * Transmet un coup, accompagné du joueur à qui revient le trait ensuite.
   * Sans cette précision le serveur alternait systématiquement les joueurs et
   * rejetait le deuxième coup d'une rafle, ce qui désynchronisait la partie.
   */
  const makeMove = (move: NetworkMove, nextPlayer: Player) => {
    if (socket && roomId) {
      socket.emit('make-move', { roomId, move, nextPlayer });
    }
  };

  // Sync game state with the server
  const syncGameState = (board: Board, currentPlayer: Player) => {
    if (socket && roomId) {
      socket.emit('sync-game-state', { roomId, board, currentPlayer });
    }
  };

  // Notify server that the game is over
  const notifyGameOver = (winner: Player) => {
    if (socket && roomId) {
      socket.emit('game-over', { roomId, winner });
    }
  };

  // Toggle multiplayer mode
  const setMultiplayerMode = (multiplayerEnabled: boolean) => {
    setIsMultiplayer(multiplayerEnabled);
    if (!multiplayerEnabled) {
      // Clean up multiplayer state when disabling
      if (socket) {
        socket.disconnect();
      }
      setSocket(null);
      setIsConnected(false);
      setRoomId(null);
      setRoomGame(null);
      setPlayer(null);
      playerTypeRef.current = null;
      setOpponent(null);
      opponentRef.current = null;
      setOpponentLeft(null);
      setIsRoomCreator(false);
      setIsGameStarted(false);
      setRematchOffered(false);
      setRematchAsked(false);
      setRematchDeclined(false);
    }
  };

  return (
    <SocketContext.Provider
      value={{
        socket,
        isConnected,
        roomId,
        roomGame,
        playerType,
        opponent,
        opponentLeft,
        acknowledgeOpponentLeft: () => setOpponentLeft(null),
        isMultiplayer,
        isRoomCreator,
        isGameStarted,
        error,
        createRoom,
        joinRoom,
        makeMove,
        syncGameState,
        notifyGameOver,
        setMultiplayerMode,
        rematchOffered,
        rematchAsked,
        rematchDeclined,
        requestRematch,
        declineRematch,
        clearRematch,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};

export default SocketContext;