const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// Palabras fijas del juego (tal cual pedido)
const WORDS = [
  "Mate",
  "Sushi",
  "Harry Potter",
  "Fast & Furious",
  "Los Simpson",
  "Johnny Depp",
  "George Clooney",
  "Extraterrestre",
  "Paris",
  "New York"
];

// Estructura en memoria por sala
// room = {
//   hostId, code,
//   players: [{ id, name, isImpostor, alive }],
//   state: 'lobby' | 'roles' | 'voting' | 'results',
//   word,
//   votes: { voterId: targetId|null },
//   roundNumber,
//   roundDurationSec, // configurada por el host (máx 300)
//   roundTimeLeft, // cuenta regresiva
//   timerInterval, // setInterval handler
//   scores: { impostors: number, crew: number, perPlayer: { [playerId]: { name, points } } }
// }

const rooms = new Map();

function genRoomCode(len = 5) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function pickRandomWord() {
  return WORDS[Math.floor(Math.random() * WORDS.length)];
}

function calcImpostorsCount(nPlayers) {
  return Math.max(1, Math.floor(nPlayers / 4));
}

function clearRoomTimer(room) {
  if (room.timerInterval) {
    clearInterval(room.timerInterval);
    room.timerInterval = null;
  }
}

function broadcastTimer(room) {
  io.to(room.code).emit('timer', { left: room.roundTimeLeft || 0, duration: room.roundDurationSec || 0 });
}

function startRoundTimer(room, durationSec) {
  clearRoomTimer(room);
  const d = Math.max(1, Math.min(300, Math.floor(durationSec || 300)));
  room.roundDurationSec = d;
  room.roundTimeLeft = d;
  broadcastTimer(room);
  room.timerInterval = setInterval(() => {
    room.roundTimeLeft = Math.max(0, (room.roundTimeLeft || 0) - 1);
    broadcastTimer(room);
    if ((room.roundTimeLeft || 0) <= 0) {
      clearRoomTimer(room);
      // Auto-iniciar votación si seguimos en fase de roles
      if (room.state === 'roles') {
        internalStartVoting(room);
      }
    }
  }, 1000);
}

function getRoomSafeState(room) {
  return {
    state: room.state,
    word: room.state === 'results' ? room.word : null,
    players: room.players.map(p => ({ id: p.id, name: p.name, alive: p.alive })),
    code: room.code,
    roundNumber: room.roundNumber || 0,
    timer: { left: room.roundTimeLeft || 0, duration: room.roundDurationSec || 0 },
    scores: {
      impostors: room.scores?.impostors || 0,
      crew: room.scores?.crew || 0,
      perPlayer: Object.fromEntries(Object.entries(room.scores?.perPlayer || {}).map(([id, s]) => [id, { name: s.name, points: s.points }]))
    }
  };
}

function assignRoles(room) {
  room.players.forEach(p => { p.alive = true; p.isImpostor = false; });
  const impostors = calcImpostorsCount(room.players.length);
  const shuffled = [...room.players].sort(() => Math.random() - 0.5);
  for (let i = 0; i < impostors; i++) shuffled[i].isImpostor = true;
}

function internalStartVoting(room) {
  // Transición a votación, sin chequeos de host
  if (!room) return;
  if (room.state !== 'roles') return;
  room.state = 'voting';
  room.votes = {};
  clearRoomTimer(room); // deja de contar en votación
  io.to(room.code).emit('votingStarted', getRoomSafeState(room));
}

function internalEndVotingAndScore(room) {
  if (!room) return null;
  if (room.state !== 'voting') return null;

  // Conteo
  const aliveIds = new Set(room.players.filter(p => p.alive).map(p => p.id));
  const tally = {};
  for (const [voterId, targetId] of Object.entries(room.votes || {})) {
    if (!aliveIds.has(voterId)) continue;
    if (targetId && aliveIds.has(targetId)) {
      tally[targetId] = (tally[targetId] || 0) + 1;
    }
  }

  let expelledId = null;
  let maxVotes = 0;
  for (const [id, count] of Object.entries(tally)) {
    if (count > maxVotes) {
      maxVotes = count;
      expelledId = id;
    } else if (count === maxVotes && count !== 0) {
      expelledId = null; // empate
    }
  }

  let result = { expelledId, expelledName: null, wasImpostor: false, word: room.word };
  if (expelledId) {
    const expelled = room.players.find(p => p.id === expelledId);
    if (expelled) {
      expelled.alive = false;
      result.expelledName = expelled.name;
      result.wasImpostor = !!expelled.isImpostor;
    }
  }

  // Puntaje por ronda (equipo + por jugador)
  room.state = 'results';
  // init scores if missing
  room.scores = room.scores || { impostors: 0, crew: 0, perPlayer: {} };
  if (result.expelledId && result.wasImpostor) {
    room.scores.crew += 1; // ganó equipo que conocía la palabra
    room.players.forEach(p => {
      if (!p.isImpostor) {
        if (!room.scores.perPlayer[p.id]) room.scores.perPlayer[p.id] = { name: p.name, points: 0 };
        room.scores.perPlayer[p.id].name = p.name; // actualizar nombre por si cambió
        room.scores.perPlayer[p.id].points += 1;
      }
    });
  } else {
    room.scores.impostors += 1; // ganaron impostores
    room.players.forEach(p => {
      if (p.isImpostor) {
        if (!room.scores.perPlayer[p.id]) room.scores.perPlayer[p.id] = { name: p.name, points: 0 };
        room.scores.perPlayer[p.id].name = p.name;
        room.scores.perPlayer[p.id].points += 1;
      }
    });
  }

  io.to(room.code).emit('resultsReady', result);
  io.to(room.code).emit('roomUpdated', getRoomSafeState(room));
  return result;
}

io.on('connection', (socket) => {
  // Crear sala
  socket.on('createRoom', ({ playerName }, cb) => {
    let code; do { code = genRoomCode(); } while (rooms.has(code));

    const room = {
      hostId: socket.id,
      code,
      players: [],
      state: 'lobby',
      word: null,
      votes: {},
      roundNumber: 0,
      roundDurationSec: 300,
      roundTimeLeft: 0,
      timerInterval: null,
      scores: { impostors: 0, crew: 0, perPlayer: {} }
    };

    rooms.set(code, room);
    socket.join(code);

    const player = { id: socket.id, name: (playerName||'Anónimo').trim() || 'Anónimo', isImpostor: false, alive: true };
    room.players.push(player);
    room.scores.perPlayer[player.id] = { name: player.name, points: 0 };

    cb?.({ ok: true, roomCode: code, you: player, room: getRoomSafeState(room) });
    io.to(code).emit('roomUpdated', getRoomSafeState(room));
  });

  // Unirse a sala
  socket.on('joinRoom', ({ roomCode, playerName }, cb) => {
    const code = (roomCode||'').toUpperCase().trim();
    const room = rooms.get(code);
    if (!room) return cb?.({ ok: false, error: 'La sala no existe.' });
    if (room.state !== 'lobby') return cb?.({ ok: false, error: 'La partida ya comenzó.' });
    if (room.players.length >= 30) return cb?.({ ok: false, error: 'Sala llena (máx. 30).' });

    socket.join(code);
    const player = { id: socket.id, name: (playerName||'Anónimo').trim() || 'Anónimo', isImpostor: false, alive: true };
    room.players.push(player);
    room.scores.perPlayer[player.id] = { name: player.name, points: 0 };

    cb?.({ ok: true, roomCode: code, you: player, room: getRoomSafeState(room) });
    io.to(code).emit('roomUpdated', getRoomSafeState(room));
  });

  // Iniciar partida (HOST) — acepta durationSec (máx 300)
  socket.on('startGame', ({ roomCode, durationSec }, cb) => {
    const room = rooms.get(roomCode);
    if (!room) return cb?.({ ok: false, error: 'Sala no encontrada.' });
    if (socket.id !== room.hostId) return cb?.({ ok: false, error: 'Solo el HOST puede iniciar.' });
    if (room.players.length < 3) return cb?.({ ok: false, error: 'Mínimo 3 jugadores (recomendado 4+).' });

    room.state = 'roles';
    room.votes = {};
    room.word = pickRandomWord();
    room.roundNumber = 1;

    assignRoles(room);

    // Enviar roles privados
    room.players.forEach(p => {
      io.to(p.id).emit('roleAssigned', { isImpostor: p.isImpostor, word: p.isImpostor ? null : room.word });
    });

    // Temporizador de ronda
    const d = Math.max(1, Math.min(300, Math.floor(durationSec || room.roundDurationSec || 300)));
    startRoundTimer(room, d);

    io.to(roomCode).emit('roomUpdated', getRoomSafeState(room));
    cb?.({ ok: true });
  });

  // Iniciar votación (HOST) o por timer
  socket.on('startVoting', ({ roomCode }, cb) => {
    const room = rooms.get(roomCode);
    if (!room) return cb?.({ ok: false, error: 'Sala no encontrada.' });
    if (socket.id !== room.hostId) return cb?.({ ok: false, error: 'Solo el HOST puede iniciar votación.' });
    if (room.state !== 'roles') return cb?.({ ok: false, error: 'No se puede iniciar votación ahora.' });

    internalStartVoting(room);
    cb?.({ ok: true });
  });

  // Emitir voto
  socket.on('castVote', ({ roomCode, targetId }, cb) => {
    const room = rooms.get(roomCode);
    if (!room) return cb?.({ ok: false, error: 'Sala no encontrada.' });
    if (room.state !== 'voting') return cb?.({ ok: false, error: 'No se está votando.' });

    const voter = room.players.find(p => p.id === socket.id && p.alive);
    if (!voter) return cb?.({ ok: false, error: 'Votante no válido.' });
    if (targetId !== null) {
      const target = room.players.find(p => p.id === targetId && p.alive);
      if (!target) return cb?.({ ok: false, error: 'Objetivo inválido.' });
    }

    room.votes[socket.id] = targetId; // null = saltar

    // Auto-cerrar si todos los vivos votaron
    const aliveIds = new Set(room.players.filter(p => p.alive).map(p => p.id));
    const votesCount = Object.keys(room.votes).filter(v => aliveIds.has(v)).length;
    if (votesCount >= aliveIds.size && aliveIds.size > 0) {
      const result = internalEndVotingAndScore(room);
      return cb?.({ ok: true, autoClosed: true, result });
    }

    io.to(roomCode).emit('votesUpdated', { total: Object.keys(room.votes).length });
    cb?.({ ok: true });
  });

  // Cerrar votación (HOST)
  socket.on('endVoting', ({ roomCode }, cb) => {
    const room = rooms.get(roomCode);
    if (!room) return cb?.({ ok: false, error: 'Sala no encontrada.' });
    if (socket.id !== room.hostId) return cb?.({ ok: false, error: 'Solo el HOST puede cerrar la votación.' });
    if (room.state !== 'voting') return cb?.({ ok: false, error: 'No se está votando.' });

    const result = internalEndVotingAndScore(room);
    cb?.({ ok: true, result });
  });

  // Siguiente ronda (HOST)
  socket.on('nextRound', ({ roomCode }, cb) => {
    const room = rooms.get(roomCode);
    if (!room) return cb?.({ ok: false, error: 'Sala no encontrada.' });
    if (socket.id !== room.hostId) return cb?.({ ok: false, error: 'Solo el HOST puede avanzar de ronda.' });
    if (room.state !== 'results') return cb?.({ ok: false, error: 'Todavía no terminó la ronda actual.' });

    room.state = 'roles';
    room.word = pickRandomWord();
    room.votes = {};
    room.roundNumber = (room.roundNumber || 0) + 1;

    assignRoles(room); // rotación de impostores automática

    // Avisar roles
    room.players.forEach(p => {
      io.to(p.id).emit('roleAssigned', { isImpostor: p.isImpostor, word: p.isImpostor ? null : room.word });
    });

    // Temporizador con misma duración configurada
    startRoundTimer(room, room.roundDurationSec || 300);

    io.to(roomCode).emit('roomUpdated', getRoomSafeState(room));
    cb?.({ ok: true });
  });

  // Reiniciar a lobby (HOST)
  socket.on('restart', ({ roomCode }, cb) => {
    const room = rooms.get(roomCode);
    if (!room) return cb?.({ ok: false, error: 'Sala no encontrada.' });
    if (socket.id !== room.hostId) return cb?.({ ok: false, error: 'Solo el HOST puede reiniciar.' });

    clearRoomTimer(room);
    room.state = 'lobby';
    room.votes = {};
    room.word = null;
    room.roundNumber = 0;
    room.roundTimeLeft = 0;
    room.scores = { impostors: 0, crew: 0, perPlayer: {} };
    room.players.forEach(p => { p.alive = true; p.isImpostor = false; room.scores.perPlayer[p.id] = { name: p.name, points: 0 }; });

    io.to(room.code).emit('roomUpdated', getRoomSafeState(room));
    cb?.({ ok: true });
  });

  // Desconexión
  socket.on('disconnect', () => {
    for (const [code, room] of rooms.entries()) {
      const idx = room.players.findIndex(p => p.id === socket.id);
      if (idx !== -1) {
        const wasHost = room.hostId === socket.id;
        const [removed] = room.players.splice(idx, 1);
        delete room.scores?.perPlayer?.[removed.id];

        if (room.players.length === 0) {
          clearRoomTimer(room);
          rooms.delete(code);
          continue;
        }
        if (wasHost) {
          room.hostId = room.players[0].id;
          io.to(room.players[0].id).emit('youAreHost', true);
        }
        io.to(code).emit('roomUpdated', getRoomSafeState(room));
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Impostor app corriendo en http://localhost:${PORT}`);
});
