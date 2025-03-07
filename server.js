const http = require('http');
const { Server } = require('socket.io');
const next = require('next');

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

const PORT = process.env.PORT || 5000;

// Game rooms storage
const gameRooms = new Map();

app.prepare().then(() => {
  const server = http.createServer((req, res) => {
    handle(req, res);
  });

  const io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  // Socket.IO connection handling
  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Create a new game room
    socket.on('create-room', (username) => {
      const roomId = generateRoomId();
      
      gameRooms.set(roomId, {
        id: roomId,
        players: [{
          id: socket.id,
          username,
          player: 'white' // First player is white
        }],
        currentPlayer: 'white',
        board: null,
        gameStarted: false
      });

      socket.join(roomId);
      socket.emit('room-created', { roomId, player: 'white' });
      
      console.log(`Room created: ${roomId} by ${username}`);
    });

    // Join an existing game room
    socket.on('join-room', ({ roomId, username }) => {
      const room = gameRooms.get(roomId);
      
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }

      if (room.players.length >= 2) {
        socket.emit('error', { message: 'Room is full' });
        return;
      }

      // Add player to room
      room.players.push({
        id: socket.id,
        username,
        player: 'black' // Second player is black
      });

      socket.join(roomId);
      socket.emit('room-joined', { roomId, player: 'black' });
      
      // Notify the other player
      socket.to(roomId).emit('opponent-joined', { username });
      
      // If we have two players, start the game
      if (room.players.length === 2) {
        room.gameStarted = true;
        io.to(roomId).emit('game-start', { 
          players: room.players.map(p => ({ username: p.username, player: p.player }))
        });
      }
      
      console.log(`${username} joined room: ${roomId}`);
    });

    // Handle player moves
    socket.on('make-move', ({ roomId, move }) => {
      const room = gameRooms.get(roomId);
      
      if (!room) return;
      
      // Find the player
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      if (playerIndex === -1) return;
      
      const player = room.players[playerIndex];
      
      // Verify it's the player's turn
      if (player.player !== room.currentPlayer) {
        socket.emit('error', { message: "It's not your turn" });
        return;
      }
      
      // Update game state
      room.currentPlayer = room.currentPlayer === 'white' ? 'black' : 'white';
      
      // Broadcast the move to the other player
      socket.to(roomId).emit('opponent-move', { move });
      
      console.log(`Move made in room ${roomId} by ${player.username}`);
    });

    // Sync game state
    socket.on('sync-game-state', ({ roomId, board, currentPlayer }) => {
      const room = gameRooms.get(roomId);
      if (!room) return;
      
      room.board = board;
      room.currentPlayer = currentPlayer;
      
      // Broadcast updated state to the other player
      socket.to(roomId).emit('game-state-updated', { board, currentPlayer });
    });

    // Handle game over
    socket.on('game-over', ({ roomId, winner }) => {
      socket.to(roomId).emit('game-over', { winner });
      console.log(`Game over in room ${roomId}. Winner: ${winner}`);
    });

    // Handle player disconnect
    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.id}`);
      
      // Find and clean up any rooms the player was in
      for (const [roomId, room] of gameRooms.entries()) {
        const playerIndex = room.players.findIndex(p => p.id === socket.id);
        
        if (playerIndex !== -1) {
          // Notify the other player
          socket.to(roomId).emit('opponent-disconnected');
          
          // Remove the room if game hasn't started, otherwise keep it for reconnection
          if (!room.gameStarted) {
            gameRooms.delete(roomId);
            console.log(`Room ${roomId} deleted after disconnect`);
          }
        }
      }
    });
  });

  server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
});

// Helper function to generate a random room ID
function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}