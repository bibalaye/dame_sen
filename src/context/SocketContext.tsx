'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { MoveType, PlayerType } from '@/types/game';

// Define the shape of our socket context
interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  roomId: string | null;
  playerType: PlayerType | null;
  opponent: string | null;
  isMultiplayer: boolean;
  isRoomCreator: boolean;
  isGameStarted: boolean;
  error: string | null;
  createRoom: (username: string) => void;
  joinRoom: (roomId: string, username: string) => void;
  makeMove: (move: MoveType) => void;
  syncGameState: (board: any, currentPlayer: PlayerType) => void;
  notifyGameOver: (winner: PlayerType) => void;
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
  const [playerType, setPlayerType] = useState<PlayerType | null>(null);
  const [opponent, setOpponent] = useState<string | null>(null);
  const [isMultiplayer, setIsMultiplayer] = useState(false);
  const [isRoomCreator, setIsRoomCreator] = useState(false);
  const [isGameStarted, setIsGameStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize socket connection when multiplayer mode is enabled
  useEffect(() => {
    if (isMultiplayer && !socket) {
      const socketInstance = io('http://localhost:5000', {
        transports: ['websocket'],
        autoConnect: true
      });

      setSocket(socketInstance);

      // Socket event listeners
      socketInstance.on('connect', () => {
        setIsConnected(true);
        console.log('Connected to server');
      });

      socketInstance.on('disconnect', () => {
        setIsConnected(false);
        console.log('Disconnected from server');
      });

      socketInstance.on('error', (data) => {
        setError(data.message);
        console.error('Socket error:', data.message);
      });

      // Clean up on unmount
      return () => {
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
      setPlayerType(data.player);
      setIsRoomCreator(true);
      console.log(`Room created: ${data.roomId}`);
    });

    // Room joined successfully
    socket.on('room-joined', (data) => {
      setRoomId(data.roomId);
      setPlayerType(data.player);
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

  // Create a new game room
  const createRoom = (username: string) => {
    if (socket && isConnected) {
      console.log('Emitting create-room event with username:', username);
      socket.emit('create-room', username);
    } else {
      console.error('Cannot create room: Socket not connected');
      setError('Not connected to server');
    }
  };

  // Join an existing game room
  const joinRoom = (roomId: string, username: string) => {
    if (socket && isConnected) {
      socket.emit('join-room', { roomId, username });
    } else {
      setError('Not connected to server');
    }
  };

  // Make a move in the game
  const makeMove = (move: MoveType) => {
    if (socket && isConnected && roomId) {
      socket.emit('make-move', { roomId, move });
    }
  };

  // Sync game state with the server
  const syncGameState = (board: any, currentPlayer: PlayerType) => {
    if (socket && isConnected && roomId) {
      socket.emit('sync-game-state', { roomId, board, currentPlayer });
    }
  };

  // Notify server that the game is over
  const notifyGameOver = (winner: PlayerType) => {
    if (socket && isConnected && roomId) {
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
      setPlayerType(null);
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