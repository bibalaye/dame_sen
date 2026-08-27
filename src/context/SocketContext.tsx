'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import type { Board, Move, Player } from '@/lib/engine';

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

// Define the shape of our socket context
interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  roomId: string | null;
  playerType: Player | null;
  opponent: string | null;
  isMultiplayer: boolean;
  isRoomCreator: boolean;
  isGameStarted: boolean;
  error: string | null;
  createRoom: (username: string) => void;
  joinRoom: (roomId: string, username: string) => void;
  makeMove: (move: Move, nextPlayer: Player) => void;
  syncGameState: (board: Board, currentPlayer: Player) => void;
  notifyGameOver: (winner: Player) => void;
  setMultiplayerMode: (isMultiplayer: boolean) => void;
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
  const [playerType, setPlayer] = useState<Player | null>(null);
  const [opponent, setOpponent] = useState<string | null>(null);
  const [isMultiplayer, setIsMultiplayer] = useState(false);
  const [isRoomCreator, setIsRoomCreator] = useState(false);
  const [isGameStarted, setIsGameStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          setError(
            'Le serveur de jeu ne répond pas. En développement, lancez « npm run server ».',
          );
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

      socketInstance.on('connect_error', (cause) => {
        setIsConnected(false);
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
      console.log('Room created event received:', data);
      setRoomId(data.roomId);
      setPlayer(data.player);
      setIsRoomCreator(true);
      console.log(`Room created: ${data.roomId}`);
    });

    // Room joined successfully
    socket.on('room-joined', (data) => {
      setRoomId(data.roomId);
      setPlayer(data.player);
      console.log(`Joined room: ${data.roomId}`);
    });

    // Opponent joined the room
    socket.on('opponent-joined', (data) => {
      setOpponent(data.username);
      console.log(`Opponent joined: ${data.username}`);
    });

    // Game started
    socket.on('game-start', (data) => {
      setIsGameStarted(true);
      console.log('Game started', data);
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
    socket.on('opponent-disconnected', () => {
      setOpponent(null);
      setIsGameStarted(false);
      console.log('Opponent disconnected');
    });

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
  const createRoom = (username: string) => {
    if (!socket) {
      setError('Le mode en ligne n’est pas encore prêt, réessayez.');
      return;
    }
    setError(null);
    socket.emit('create-room', username);
  };

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
  const makeMove = (move: Move, nextPlayer: Player) => {
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
      setPlayer(null);
      setOpponent(null);
      setIsRoomCreator(false);
      setIsGameStarted(false);
    }
  };

  return (
    <SocketContext.Provider
      value={{
        socket,
        isConnected,
        roomId,
        playerType,
        opponent,
        isMultiplayer,
        isRoomCreator,
        isGameStarted,
        error,
        createRoom,
        joinRoom,
        makeMove,
        syncGameState,
        notifyGameOver,
        setMultiplayerMode
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};

export default SocketContext;