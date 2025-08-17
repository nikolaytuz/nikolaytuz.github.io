const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const CONFIG = {
  grid: { cols: 10, rows: 16 },
  mana: { regenPerSec: 1, max: 10 },
  costs: { unit: 5, building: 10 },
  unit: { speedCellsPerSec: 3 },
  building: { spawnPeriodMs: 2000 },
  log: { pushCells: 1, jitterMs: 120 },
  net: { tickMs: 100 },
  countdownSec: 3,
};

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname + '/public'));

// game state
const state = {
  phase: 'waiting', // waiting|countdown|playing|ended
  countdown: 0, // ticks
  players: {}, // id -> {id, side, mana}
  units: [],
  buildings: [],
  log: { y: Math.floor(CONFIG.grid.rows / 2), jitter: 0 },
  manaTick: 0,
};

function resetGame() {
  state.units = [];
  state.buildings = [];
  state.log.y = Math.floor(CONFIG.grid.rows / 2);
  state.log.jitter = 0;
  Object.values(state.players).forEach((p) => (p.mana = 0));
  state.manaTick = 0;
}

function startCountdown() {
  resetGame();
  state.phase = 'countdown';
  state.countdown = (CONFIG.countdownSec * 1000) / CONFIG.net.tickMs;
}

function regenMana() {
  Object.values(state.players).forEach((p) => {
    p.mana = Math.min(p.mana + 1, CONFIG.mana.max);
  });
}

function updateBuildings() {
  for (const b of state.buildings) {
    b.timer -= CONFIG.net.tickMs;
    if (b.timer <= 0) {
      state.units.push({
        id: Date.now() + Math.random(),
        x: b.x,
        y: b.y,
        owner: b.owner,
      });
      b.timer = CONFIG.building.spawnPeriodMs;
    }
  }
}

function updateUnits() {
  const speed =
    (CONFIG.unit.speedCellsPerSec * CONFIG.net.tickMs) / 1000;
  for (let i = state.units.length - 1; i >= 0; i--) {
    const u = state.units[i];
    const player = state.players[u.owner];
    if (!player) {
      state.units.splice(i, 1);
      continue;
    }
    const dir = player.side === 'top' ? 1 : -1;
    u.y += speed * dir;
    if (
      (dir === 1 && u.y >= state.log.y) ||
      (dir === -1 && u.y <= state.log.y)
    ) {
      state.log.y += CONFIG.log.pushCells * dir;
      state.log.jitter = CONFIG.log.jitterMs / CONFIG.net.tickMs;
      state.units.splice(i, 1);
      continue;
    }
    if (u.y < 0 || u.y > CONFIG.grid.rows - 1) {
      state.units.splice(i, 1);
    }
  }
}

function checkWin() {
  if (state.log.y <= 0) {
    io.emit('gameOver', { winner: 'bottom' });
    state.phase = 'ended';
  } else if (state.log.y >= CONFIG.grid.rows - 1) {
    io.emit('gameOver', { winner: 'top' });
    state.phase = 'ended';
  }
}

function canPlace(player, type, x, y) {
  const { cols, rows } = CONFIG.grid;
  if (x < 0 || x >= cols || y < 0 || y >= rows) return false;
  if (y === state.log.y) return false; // log row
  if (player.side === 'top' && y >= state.log.y) return false;
  if (player.side === 'bottom' && y <= state.log.y) return false;
  if (type === 'building') {
    if (state.buildings.some((b) => b.x === x && b.y === y)) return false;
  }
  return true;
}

function gameTick() {
  if (state.phase === 'countdown') {
    state.countdown--;
    if (state.countdown <= 0) {
      state.phase = 'playing';
    }
  } else if (state.phase === 'playing') {
    state.manaTick += CONFIG.net.tickMs;
    if (state.manaTick >= 1000) {
      regenMana();
      state.manaTick -= 1000;
    }
    updateBuildings();
    updateUnits();
    if (state.log.jitter > 0) state.log.jitter--;
    checkWin();
  }

  io.emit('state', {
    phase: state.phase,
    countdown: Math.ceil((state.countdown * CONFIG.net.tickMs) / 1000),
    players: Object.fromEntries(
      Object.entries(state.players).map(([id, p]) => [id, { mana: p.mana, side: p.side }])
    ),
    units: state.units,
    buildings: state.buildings,
    log: state.log,
  });
}

setInterval(gameTick, CONFIG.net.tickMs);

io.on('connection', (socket) => {
  if (Object.keys(state.players).length >= 2) {
    socket.emit('full');
    socket.disconnect();
    return;
  }
  const side = Object.values(state.players).find((p) => p.side === 'top')
    ? 'bottom'
    : 'top';
  state.players[socket.id] = { id: socket.id, side, mana: 0 };
  socket.emit('joined', { id: socket.id, side });

  if (Object.keys(state.players).length === 2 && state.phase === 'waiting') {
    startCountdown();
  }

  socket.on('playCard', ({ type, x, y }) => {
    const player = state.players[socket.id];
    if (state.phase !== 'playing' || !player) return;
    if (!canPlace(player, type, x, y)) {
      socket.emit('invalid');
      return;
    }
    const cost = CONFIG.costs[type];
    if (player.mana < cost) {
      socket.emit('invalid');
      return;
    }
    player.mana -= cost;
    if (type === 'unit') {
      state.units.push({ id: Date.now() + Math.random(), x, y, owner: socket.id });
    } else if (type === 'building') {
      state.buildings.push({
        id: Date.now() + Math.random(),
        x,
        y,
        owner: socket.id,
        timer: CONFIG.building.spawnPeriodMs,
      });
    }
  });

  socket.on('restart', () => {
    if (state.phase === 'ended' && Object.keys(state.players).length === 2) {
      startCountdown();
    }
  });

  socket.on('disconnect', () => {
    delete state.players[socket.id];
    state.phase = 'waiting';
    io.emit('opponentLeft');
  });
});

server.listen(PORT, () => console.log('Server listening on', PORT));
