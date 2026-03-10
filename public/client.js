const socket = io();

// Estado en cliente
let state = {
  roomCode: null,
  you: null,
  isHost: false,
  current: 'setup',
  room: null,
  desiredDurationSec: 300 // por defecto 5 min
};

// Helpers de UI
const $ = (sel) => document.querySelector(sel);
const show = (sel) => $(sel).classList.remove('hidden');
const hide = (sel) => $(sel).classList.add('hidden');
const setText = (sel, txt) => { $(sel).textContent = txt; };

function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec||0));
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function go(view) {
  ['#setup', '#lobby', '#roles', '#voting', '#results'].forEach(hide);
  const map = { setup:'#setup', lobby:'#lobby', roles:'#roles', voting:'#voting', results:'#results' };
  show(map[view]);
  state.current = view;
}

function renderTopbar() {
  setText('#roomCodeTop', state.roomCode ? `Sala — ${state.roomCode}` : 'Sala — ');
  setText('#roundLabel', `Ronda ${state.room?.roundNumber || 0}`);
  const sc = state.room?.scores || { crew:0, impostors:0 };
  setText('#scoreLabel', `Marcador — Conocen: ${sc.crew || 0} | Impostores: ${sc.impostors || 0}`);
  const t = state.room?.timer || { left:0 };
  setText('#timerLabel', `⏱ ${fmtTime(t.left)}`);
}

function renderLobby() {
  renderTopbar();
  setText('#roomCodeLabel', state.roomCode || '');
  const list = $('#playersList');
  list.innerHTML = '';
  if (!state.room) return;
  state.room.players.forEach(p => {
    const div = document.createElement('div');
    div.className = 'pill';
    div.textContent = p.name + (p.id === state.you?.id ? ' (vos)' : '');
    list.appendChild(div);
  });
  $('#hostBadge').classList.toggle('hidden', !state.isHost);
  $('#btnStart').classList.toggle('hidden', !state.isHost);
}

function renderRoles() {
  renderTopbar();
  const box = $('#yourRole');
  box.innerHTML = '<p class="muted">Esperando tu rol...</p>';
  $('#btnStartVoting').classList.toggle('hidden', !state.isHost);
}

function renderVoting() {
  renderTopbar();
  const list = $('#votingList');
  list.innerHTML = '';
  if (!state.room) return;
  state.room.players.filter(p => p.alive).forEach(p => {
    const btn = document.createElement('button');
    btn.className = 'ghost';
    btn.textContent = p.name + (p.id === state.you?.id ? ' (vos)' : '');
    btn.onclick = () => castVote(p.id);
    list.appendChild(btn);
  });
  const skip = document.createElement('button');
  skip.className = 'ghost';
  skip.textContent = 'Saltar voto';
  skip.onclick = () => castVote(null);
  list.appendChild(skip);
  $('#btnEndVoting').classList.toggle('hidden', !state.isHost);
  setText('#votesProgress', '');
}

function renderResults(result) {
  renderTopbar();
  const box = $('#resultBox');
  box.innerHTML = '';
  const w = document.createElement('div');
  w.className = 'card';
  w.innerHTML = `
    <p><strong>Palabra:</strong> ${result.word || '(oculta)'}</p>
    <p><strong>Expulsado:</strong> ${result.expelledName ? result.expelledName : 'Nadie (empate o sin votos)'}</p>
    <p><strong>¿Era impostor?</strong> ${result.expelledName ? (result.wasImpostor ? 'Sí ✅' : 'No ❌') : '-'}</p>
    <p><em>${result.expelledName ? (result.wasImpostor ? '¡Ganaron quienes conocían la palabra!' : '¡Ganaron los impostores!') : 'Sin expulsión: ventaja para impostores.'}</em></p>
  `;
  box.appendChild(w);
  renderScoreBoard();
  $('#btnNextRound').classList.toggle('hidden', !state.isHost);
  $('#btnRestart').classList.toggle('hidden', !state.isHost);
}

function renderScoreBoard() {
  const sb = $('#scoreBoard');
  const scores = state.room?.scores || { impostors:0, crew:0, perPlayer:{} };
  const per = scores.perPlayer || {};
  const players = Object.values(per).sort((a,b)=> (b.points||0)-(a.points||0));
  sb.innerHTML = `
    <p><strong>Equipos:</strong> Conocen ${scores.crew||0} — Impostores ${scores.impostors||0}</p>
    <div class="grid">
      ${players.map(p => `<div class="row"><span>${p.name}</span><span>${p.points||0} pts</span></div>`).join('') || '<p class="muted">Sin puntajes aún.</p>'}
    </div>
  `;
}

async function createRoom() {
  const playerName = $('#nameCreate').value.trim() || 'Anónimo';
  const min = Math.max(1, Math.min(5, parseInt($('#durationMinutes').value || '5', 10)));
  state.desiredDurationSec = min * 60;
  socket.emit('createRoom', { playerName }, (res) => {
    if (!res?.ok) return alert(res?.error || 'Error creando sala.');
    state.roomCode = res.roomCode;
    state.you = res.you;
    state.isHost = true;
    state.room = res.room;
    go('lobby');
    renderLobby();
  });
}

async function joinRoom() {
  const roomCode = $('#roomCodeJoin').value.trim().toUpperCase();
  const playerName = $('#nameJoin').value.trim() || 'Anónimo';
  if (!roomCode) return alert('Ingresá el código de sala.');
  socket.emit('joinRoom', { roomCode, playerName }, (res) => {
    if (!res?.ok) return alert(res?.error || 'No se pudo unir.');
    state.roomCode = res.roomCode;
    state.you = res.you;
    state.isHost = false;
    state.room = res.room;
    go('lobby');
    renderLobby();
  });
}

function startGame() {
  socket.emit('startGame', { roomCode: state.roomCode, durationSec: state.desiredDurationSec }, (res) => {
    if (!res?.ok) alert(res?.error || 'No se pudo iniciar.');
  });
}

function startVoting() {
  socket.emit('startVoting', { roomCode: state.roomCode }, (res) => {
    if (!res?.ok) alert(res?.error || 'No se pudo iniciar votación.');
  });
}

function castVote(targetId) {
  socket.emit('castVote', { roomCode: state.roomCode, targetId }, (res) => {
    if (!res?.ok) alert(res?.error || 'No se pudo votar.');
  });
}

function endVoting() {
  socket.emit('endVoting', { roomCode: state.roomCode }, (res) => {
    if (!res?.ok) alert(res?.error || 'No se pudo cerrar votación.');
  });
}

function nextRound() {
  socket.emit('nextRound', { roomCode: state.roomCode }, (res) => {
    if (!res?.ok) alert(res?.error || 'No se pudo avanzar de ronda.');
  });
}

function restart() {
  socket.emit('restart', { roomCode: state.roomCode }, (res) => {
    if (!res?.ok) alert(res?.error || 'No se pudo reiniciar.');
  });
}

// Event listeners UI
$('#btnCreate').onclick = createRoom;
$('#btnJoin').onclick = joinRoom;
$('#btnStart').onclick = startGame;
$('#btnStartVoting').onclick = startVoting;
$('#btnEndVoting').onclick = endVoting;
$('#btnNextRound').onclick = nextRound;
$('#btnRestart').onclick = restart;
$('#durationMinutes').onchange = (e) => {
  const v = Math.max(1, Math.min(5, parseInt(e.target.value || '5', 10)));
  e.target.value = v;
  state.desiredDurationSec = v * 60;
};

// Socket listeners
socket.on('roomUpdated', (room) => {
  state.room = room;
  if (!state.roomCode) state.roomCode = room.code;
  renderTopbar();
  if (room.state === 'lobby') { go('lobby'); renderLobby(); }
  else if (room.state === 'roles') { go('roles'); renderRoles(); }
  else if (room.state === 'voting') { go('voting'); renderVoting(); }
  else if (room.state === 'results') { go('results'); }
});

socket.on('roleAssigned', ({ isImpostor, word }) => {
  const box = $('#yourRole');
  if (isImpostor) {
    box.innerHTML = `
      <div class="role impostor">¡Sos el Impostor!</div>
      <p>Tu objetivo es mezclarte sin conocer la palabra.</p>
    `;
  } else {
    box.innerHTML = `
      <div class="role crew">Tu palabra es:</div>
      <div class="secret">${word}</div>
      <p>Da pistas sin decir la palabra exacta.</p>
    `;
  }
});

socket.on('votingStarted', (room) => {
  state.room = room; go('voting'); renderVoting();
});

socket.on('votesUpdated', ({ total }) => {
  setText('#votesProgress', `Votos registrados: ${total}`);
});

socket.on('resultsReady', (result) => {
  go('results');
  renderResults(result);
});

socket.on('youAreHost', () => {
  state.isHost = true;
  if (state.current === 'lobby') renderLobby();
  if (state.current === 'roles') $('#btnStartVoting').classList.toggle('hidden', !state.isHost);
  if (state.current === 'voting') $('#btnEndVoting').classList.toggle('hidden', !state.isHost);
  if (state.current === 'results') { $('#btnNextRound').classList.toggle('hidden', !state.isHost); $('#btnRestart').classList.toggle('hidden', !state.isHost); }
});

socket.on('timer', ({ left, duration }) => {
  if (!state.room) state.room = {};
  state.room.timer = { left, duration };
  renderTopbar();
});
