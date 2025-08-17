const socket = io();

let playerId = null;
let playerSide = null;
let selectedCard = 'unit';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const manaDiv = document.getElementById('mana');
const selectedSpan = document.getElementById('selectedCard');

const GRID_WIDTH = 9;
const GRID_HEIGHT = 15;
const CELL_SIZE = 40;

canvas.width = GRID_WIDTH * CELL_SIZE;
canvas.height = GRID_HEIGHT * CELL_SIZE;

document.getElementById('unitBtn').onclick = () => {
  selectedCard = 'unit';
  selectedSpan.textContent = selectedCard;
};

document.getElementById('buildingBtn').onclick = () => {
  selectedCard = 'building';
  selectedSpan.textContent = selectedCard;
};

canvas.addEventListener('click', (e) => {
  if (!playerId) return;
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor((e.clientX - rect.left) / CELL_SIZE);
  const y = Math.floor((e.clientY - rect.top) / CELL_SIZE);
  socket.emit('playCard', { type: selectedCard, x, y });
});

socket.on('joined', (data) => {
  playerId = data.id;
  playerSide = data.side;
});

socket.on('state', (state) => {
  const me = state.players[playerId] || { mana: 0 };
  manaDiv.textContent = `Mana: ${me.mana}`;
  draw(state);
});

socket.on('gameOver', (data) => {
  alert('Winner: ' + data.winner);
});

function draw(state) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#ccc';
  for (let i = 0; i <= GRID_WIDTH; i++) {
    ctx.beginPath();
    ctx.moveTo(i * CELL_SIZE, 0);
    ctx.lineTo(i * CELL_SIZE, canvas.height);
    ctx.stroke();
  }
  for (let j = 0; j <= GRID_HEIGHT; j++) {
    ctx.beginPath();
    ctx.moveTo(0, j * CELL_SIZE);
    ctx.lineTo(canvas.width, j * CELL_SIZE);
    ctx.stroke();
  }

  // log
  ctx.fillStyle = 'brown';
  ctx.fillRect(state.log.x * CELL_SIZE, state.log.y * CELL_SIZE, CELL_SIZE, CELL_SIZE);

  // buildings
  ctx.fillStyle = 'gray';
  state.buildings.forEach((b) => {
    ctx.fillRect(b.x * CELL_SIZE, b.y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
  });

  // units
  state.units.forEach((u) => {
    ctx.fillStyle = u.owner === playerId ? 'green' : 'red';
    ctx.fillRect(u.x * CELL_SIZE, u.y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
  });
}
