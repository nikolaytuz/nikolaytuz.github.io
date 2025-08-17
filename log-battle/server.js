const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname + '/public'));

const GRID_WIDTH = 9;
const GRID_HEIGHT = 15;
let tick = 0;

const log = { x: Math.floor(GRID_WIDTH / 2), y: Math.floor(GRID_HEIGHT / 2) };
const players = {};
const units = [];
const buildings = [];

function addMana() {
  Object.values(players).forEach((p) => {
    p.mana = Math.min(p.mana + 1, 100);
  });
}

function updateBuildings() {
  buildings.forEach((b) => {
    b.cooldown--;
    if (b.cooldown <= 0) {
      units.push({
        id: Date.now() + Math.random(),
        x: b.x,
        y: b.y,
        speed: 0.2,
        owner: b.owner,
      });
      b.cooldown = b.spawnRate;
    }
  });
}

function updateUnits() {
  for (let i = units.length - 1; i >= 0; i--) {
    const u = units[i];
    const player = players[u.owner];
    if (!player) {
      units.splice(i, 1);
      continue;
    }
    if (player.side === 'top') {
      u.y += u.speed;
      if (u.y >= log.y && Math.abs(u.x - log.x) < 0.1) {
        log.y += 1;
        units.splice(i, 1);
        continue;
      }
    } else {
      u.y -= u.speed;
      if (u.y <= log.y && Math.abs(u.x - log.x) < 0.1) {
        log.y -= 1;
        units.splice(i, 1);
        continue;
      }
    }
    if (u.y < 0 || u.y >= GRID_HEIGHT) {
      units.splice(i, 1);
    }
  }
}

function checkWin() {
  if (log.y <= 0) {
    io.emit('gameOver', { winner: 'bottom' });
    resetGame();
  } else if (log.y >= GRID_HEIGHT - 1) {
    io.emit('gameOver', { winner: 'top' });
    resetGame();
  }
}

function resetGame() {
  log.y = Math.floor(GRID_HEIGHT / 2);
  units.length = 0;
  buildings.length = 0;
  Object.values(players).forEach((p) => (p.mana = 0));
}

function gameLoop() {
  tick++;
  if (tick % 2 === 0) addMana();
  updateBuildings();
  updateUnits();
  checkWin();
  io.emit('state', {
    players: Object.fromEntries(
      Object.entries(players).map(([id, p]) => [id, { mana: p.mana, side: p.side }])
    ),
    units,
    buildings,
    log,
  });
}

setInterval(gameLoop, 50);

io.on('connection', (socket) => {
  console.log('client connected', socket.id);
  if (Object.keys(players).length >= 2) {
    socket.emit('full');
    socket.disconnect();
    return;
  }
  const side = Object.values(players).find((p) => p.side === 'top') ? 'bottom' : 'top';
  players[socket.id] = { id: socket.id, side, mana: 0 };
  socket.emit('joined', { id: socket.id, side });
  console.log(`Player ${socket.id} joined as ${side}`);

  socket.on('playCard', (data) => {
    const player = players[socket.id];
    if (!player) return;
    if (data.type === 'unit') {
      const cost = 5;
      if (player.mana < cost) return;
      player.mana -= cost;
      units.push({
        id: Date.now() + Math.random(),
        x: data.x,
        y: data.y,
        speed: 0.2,
        owner: socket.id,
      });
    } else if (data.type === 'building') {
      const cost = 10;
      if (player.mana < cost) return;
      player.mana -= cost;
      buildings.push({
        id: Date.now() + Math.random(),
        x: data.x,
        y: data.y,
        owner: socket.id,
        cooldown: 40,
        spawnRate: 40,
      });
    }
  });

  socket.on('disconnect', () => {
    console.log('client disconnected', socket.id);
    delete players[socket.id];
  });
});

server.listen(PORT, () => {
  console.log('Server running on port', PORT);
});
