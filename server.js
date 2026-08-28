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
    // Sonde de santé : permet de vérifier d'un coup d'œil que le service temps
    // réel tourne, et sert de test de disponibilité aux hébergeurs.
    if (req.url === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, rooms: gameRooms.size }));
      return;
    }
    handle(req, res);
  });

  // La page peut être servie par un autre domaine que ce serveur temps réel
  // (Vercel d'un côté, l'hébergeur des websockets de l'autre). ALLOWED_ORIGIN
  // restreint qui a le droit de s'y connecter ; sans elle, tout est accepté.
  const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';

  const io = new Server(server, {
    cors: {
      origin: allowedOrigin === '*' ? '*' : allowedOrigin.split(',').map(o => o.trim()),
      methods: ['GET', 'POST']
    }
  });

  // Socket.IO connection handling
  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Create a new game room
    socket.on('create-room', (payload) => {
      // L'ancien protocole n'envoyait qu'un nom ; on accepte les deux formes.
      const username = typeof payload === 'string' ? payload : payload?.username;
      const game = (typeof payload === 'object' && payload?.game) || 'dames';
      const roomId = generateRoomId();

      gameRooms.set(roomId, {
        id: roomId,
        // Le jeu de la salle : celui qui rejoint doit ouvrir le même plateau.
        game,
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
      socket.emit('room-created', { roomId, player: 'white', game });

      console.log(`Room created: ${roomId} by ${username} (${game})`);
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
      socket.emit('room-joined', { roomId, player: 'black', game: room.game ?? 'dames' });
      
      // Notify the other player
      socket.to(roomId).emit('opponent-joined', { username });
      
      // If we have two players, start the game
      if (room.players.length === 2) {
        room.gameStarted = true;
        io.to(roomId).emit('game-start', {
          game: room.game ?? 'dames',
          players: room.players.map(p => ({ username: p.username, player: p.player }))
        });
      }
      
      console.log(`${username} joined room: ${roomId}`);
    });

    // Handle player moves
    socket.on('make-move', ({ roomId, move, nextPlayer }) => {
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

      // Le client indique à qui revient le trait. Alterner d'office ici cassait
      // les rafles : le deuxième coup d'un enchaînement était rejeté alors que
      // le joueur a bien le droit de rejouer.
      room.currentPlayer =
        nextPlayer === 'white' || nextPlayer === 'black'
          ? nextPlayer
          : room.currentPlayer === 'white' ? 'black' : 'white';

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
    console.log(`Origines autorisées : ${allowedOrigin}`);
    startKeepAlive();
  });
});

// Helper function to generate a random room ID
function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

/**
 * Maintien en éveil.
 *
 * Les offres gratuites — Render en tête — suspendent un service qui ne reçoit
 * aucune requête pendant un quart d'heure. La reprise prend ensuite près d'une
 * minute, pendant laquelle une partie en ligne ne peut pas démarrer.
 *
 * Le service s'appelle donc lui-même à intervalle régulier. Cela suffit à
 * empêcher la mise en veille tant qu'il tourne ; en revanche, un service déjà
 * endormi ne peut pas se réveiller seul — il faut pour cela un appel venu de
 * l'extérieur (voir le workflow .github/workflows/keep-alive.yml).
 *
 * KEEP_ALIVE_URL force l'adresse à appeler ; sinon on prend celle que Render
 * publie de lui-même. Sans l'une ni l'autre — en développement — rien ne tourne.
 */
function startKeepAlive() {
  const target = process.env.KEEP_ALIVE_URL || process.env.RENDER_EXTERNAL_URL;
  if (!target) return;

  const minutes = Number(process.env.KEEP_ALIVE_MINUTES || 5);
  const url = `${target.replace(/\/$/, '')}/healthz`;

  console.log(`Maintien en éveil : ${url} toutes les ${minutes} min`);

  const timer = setInterval(() => {
    fetch(url)
      .then((res) => {
        if (!res.ok) console.warn(`Maintien en éveil : réponse ${res.status}`);
      })
      .catch((err) => {
        // Une coupure réseau passagère ne doit pas arrêter le service.
        console.warn('Maintien en éveil : appel échoué —', err.message);
      });
  }, minutes * 60 * 1000);

  // Ne pas retenir le processus si tout le reste s'arrête.
  timer.unref?.();
}