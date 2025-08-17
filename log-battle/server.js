const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

// ---- configuration ----
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

// ---- setup ----
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname + '/public'));

// ---- game state ----
const state = {
  phase: 'waiting',
  players: {}, // id -> {id, side, mana}
  units: [],
  buildings: [],
  log: {
    x: Math.floor(CONFIG.grid.cols / 2),
    y: Math.floor(CONFIG.grid.rows / 2),
    jitter: 0,
  },
  countdown: CONFIG.countdownSec,
  winner: null,
  message: null,
};

// ---- helpers ----
function resetForNewGame() {
  state.units = [];
  state.buildings = [];
  state.log = {
    x: Math.floor(CONFIG.grid.cols / 2),
    y: Math.floor(CONFIG.grid.rows / 2),
    jitter: 0,
  };
  state.winner = null;
  state.countdown = CONFIG.countdownSec;
  Object.values(state.players).forEach((p) => (p.mana = 0));
  state.message = null;
}

function startCountdown() {
  state.phase = 'countdown';
  state.countdown = CONFIG.countdownSec;
  state.message = null;
}

function regenMana() {
  const gain = (CONFIG.mana.regenPerSec * CONFIG.net.tickMs) / 1000;
  Object.values(state.players).forEach((p) => {
    p.mana = Math.min(CONFIG.mana.max, p.mana + gain);
  });
}

function updateBuildings() {
  state.buildings.forEach((b) => {
    b.spawnTimer -= CONFIG.net.tickMs;
    if (b.spawnTimer <= 0) {
      const owner = state.players[b.owner];
      if (owner) {
        const dir = owner.side === 'top' ? 1 : -1;
        const spawnY = b.y + dir;
        const spawnX = b.x;
        const occupied = state.buildings.some(
          (ob) => ob.x === spawnX && ob.y === spawnY
        );
        if (
          spawnY >= 0 &&
          spawnY < CONFIG.grid.rows &&
          spawnY !== state.log.y &&
          !occupied
        ) {
          state.units.push({
            id: Date.now() + Math.random(),
            x: spawnX,
            y: spawnY,
            owner: b.owner,
          });
        }
      }
      b.spawnTimer = CONFIG.building.spawnPeriodMs;
    }
  });
}

function updateUnits() {
  const speed = (CONFIG.unit.speedCellsPerSec * CONFIG.net.tickMs) / 1000;
  for (let i = state.units.length - 1; i >= 0; i--) {
    const u = state.units[i];
    const player = state.players[u.owner];
    if (!player) {
      state.units.splice(i, 1);
      continue;
    }
    if (player.side === 'top') {
      u.y += speed;
      if (u.y >= state.log.y) {
        state.log.y = Math.min(
          CONFIG.grid.rows - 1,
          state.log.y + CONFIG.log.pushCells
        );
        state.log.jitter = CONFIG.log.jitterMs;
        state.units.splice(i, 1);
        continue;
      }
    } else {
      u.y -= speed;
      if (u.y <= state.log.y) {
        state.log.y = Math.max(0, state.log.y - CONFIG.log.pushCells);
        state.log.jitter = CONFIG.log.jitterMs;
        state.units.splice(i, 1);
        continue;
      }
    }
    if (u.y < 0 || u.y > CONFIG.grid.rows - 1) {
      state.units.splice(i, 1);
    }
  }
}

function reduceLogJitter() {
  if (state.log.jitter > 0) {
    state.log.jitter = Math.max(0, state.log.jitter - CONFIG.net.tickMs);
  }
}

function checkWin() {
  if (state.log.y <= 0) {
    state.phase = 'ended';
    state.winner = 'bottom';
  } else if (state.log.y >= CONFIG.grid.rows - 1) {
    state.phase = 'ended';
    state.winner = 'top';
  }
}

function sendState() {
  io.emit('state', {
    phase: state.phase,
    countdown: Math.ceil(state.countdown),
    players: state.players,
    units: state.units,
    buildings: state.buildings,
    log: state.log,
    winner: state.winner,
    message: state.message,
  });
}

function isValidPlacement(player, type, x, y) {
  if (x < 0 || x >= CONFIG.grid.cols || y < 0 || y >= CONFIG.grid.rows)
    return false;
  if (y === state.log.y) return false;
  if (player.side === 'top' && y >= state.log.y) return false;
  if (player.side === 'bottom' && y <= state.log.y) return false;
  if (type === 'building') {
    if (state.buildings.some((b) => b.x === x && b.y === y)) return false;
  }
  return true;
}

// ---- game loop ----
function gameTick() {
  if (state.phase === 'countdown') {
    state.countdown -= CONFIG.net.tickMs / 1000;
    if (state.countdown <= 0) {
      state.phase = 'playing';
    }
  }

  if (state.phase === 'playing') {
    regenMana();
    updateBuildings();
    updateUnits();
    reduceLogJitter();
    checkWin();
  }

  sendState();
}

setInterval(gameTick, CONFIG.net.tickMs);

// ---- socket handling ----
io.on('connection', (socket) => {
  if (Object.keys(state.players).length >= 2) {
    socket.emit('full');
    socket.disconnect();
    return;
  }

  const side =
    Object.values(state.players).find((p) => p.side === 'top') ? 'bottom' : 'top';
  state.players[socket.id] = { id: socket.id, side, mana: 0 };
  socket.emit('joined', { id: socket.id, side });

  if (
    Object.keys(state.players).length === 2 &&
    (state.phase === 'waiting' || state.phase === 'ended')
  ) {
    resetForNewGame();
    startCountdown();
  }

  socket.on('playCard', ({ type, x, y }) => {
    if (state.phase !== 'playing') return;
    const player = state.players[socket.id];
    if (!player) return;

    if (type === 'unit') {
      if (player.mana < CONFIG.costs.unit) return;
      if (!isValidPlacement(player, 'unit', x, y)) return;
      player.mana -= CONFIG.costs.unit;
      state.units.push({
        id: Date.now() + Math.random(),
        x,
        y,
        owner: socket.id,
      });
    } else if (type === 'building') {
      if (player.mana < CONFIG.costs.building) return;
      if (!isValidPlacement(player, 'building', x, y)) return;
      player.mana -= CONFIG.costs.building;
      state.buildings.push({
        id: Date.now() + Math.random(),
        x,
        y,
        owner: socket.id,
        spawnTimer: CONFIG.building.spawnPeriodMs,
      });
    }
  });

  socket.on('restart', () => {
    if (state.phase === 'ended') {
      resetForNewGame();
      if (Object.keys(state.players).length === 2) {
        startCountdown();
      } else {
        state.phase = 'waiting';
      }
    }
  });

  socket.on('disconnect', () => {
    delete state.players[socket.id];
    state.phase = 'waiting';
    state.message = 'Противник покинул игру';
    sendState();
  });
});

// ---- start server ----
server.listen(PORT, () => {
  console.log('Server running on port', PORT);
});

