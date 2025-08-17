import { CONFIG } from './config.js';
import {
  state,
  updateLocal,
  manaShown,
  myMana,
  playerId,
  playerSide,
} from './state.js';
import { playCard, requestRestart } from './net.js';

// canvas setup
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = CONFIG.grid.cols * CONFIG.grid.cell;
canvas.height = CONFIG.grid.rows * CONFIG.grid.cell;

// UI elements
const manaText = document.getElementById('manaText');
const manaBar = document.getElementById('manaBar');
const unitBtn = document.getElementById('unitBtn');
const buildingBtn = document.getElementById('buildingBtn');
const overlay = document.getElementById('overlay');
const overlayText = document.getElementById('overlayText');
const newGameBtn = document.getElementById('newGame');

let selectedCard = 'unit';
let hover = { x: -1, y: -1 };
let lastTime = performance.now();
let prevLogJitter = 0;
const particles = [];

function selectCard(card) {
  selectedCard = card;
}

unitBtn.addEventListener('click', () => selectCard('unit'));
buildingBtn.addEventListener('click', () => selectCard('building'));

window.addEventListener('keydown', (e) => {
  if (e.key === '1') selectCard('unit');
  if (e.key === '2') selectCard('building');
  if (e.key.toLowerCase() === 'q' || e.key.toLowerCase() === 'e') {
    cycleCard(e.key.toLowerCase() === 'q' ? -1 : 1);
  }
});

window.addEventListener('wheel', (e) => {
  cycleCard(e.deltaY > 0 ? 1 : -1);
});

function cycleCard(dir) {
  const cards = ['unit', 'building'];
  let idx = cards.indexOf(selectedCard);
  idx = (idx + dir + cards.length) % cards.length;
  selectedCard = cards[idx];
}

canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor((e.clientX - rect.left) / CONFIG.grid.cell);
  const y = Math.floor((e.clientY - rect.top) / CONFIG.grid.cell);
  hover = { x, y };
});

canvas.addEventListener('mouseleave', () => {
  hover = { x: -1, y: -1 };
});

canvas.addEventListener('click', () => {
  if (state.phase !== 'playing') return;
  if (!canPlace(selectedCard, hover.x, hover.y)) {
    shake(canvas);
    return;
  }
  const cost = CONFIG.costs[selectedCard];
  if (myMana() < cost) {
    shake(selectedCard === 'unit' ? unitBtn : buildingBtn);
    return;
  }
  playCard(selectedCard, hover.x, hover.y);
});

newGameBtn.addEventListener('click', () => {
  requestRestart();
});

function canPlace(type, x, y) {
  if (x < 0 || x >= CONFIG.grid.cols || y < 0 || y >= CONFIG.grid.rows)
    return false;
  if (y === state.log.y) return false;
  if (playerSide === 'top' && y >= state.log.y) return false;
  if (playerSide === 'bottom' && y <= state.log.y) return false;
  if (type === 'building' && state.buildings.some((b) => b.x === x && b.y === y))
    return false;
  return true;
}

function shake(el) {
  el.classList.remove('shake');
  void el.offsetWidth; // restart animation
  el.classList.add('shake');
}

function spawnParticles(x, y, count) {
  for (let i = 0; i < count; i++) {
    particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 2,
      vy: (Math.random() - 0.5) * 2,
      life: 300 + Math.random() * 200,
    });
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function drawParticles() {
  particles.forEach((p) => {
    ctx.fillStyle = `rgba(200,150,50,${p.life / 500})`;
    ctx.fillRect(p.x, p.y, 3, 3);
  });
}

function update(dt) {
  updateLocal(dt);
  if (state.log.jitter > 0 && prevLogJitter <= 0) {
    const lx = state.log.x * CONFIG.grid.cell + CONFIG.grid.cell / 2;
    const ly = state.log.y * CONFIG.grid.cell;
    spawnParticles(lx, ly, 6);
  }
  prevLogJitter = state.log.jitter;
  updateParticles(dt);
  manaText.textContent = Math.floor(manaShown);
  const pct = manaShown / CONFIG.mana.max;
  manaBar.style.width = pct * 100 + '%';

  unitBtn.disabled = myMana() < CONFIG.costs.unit;
  buildingBtn.disabled = myMana() < CONFIG.costs.building;
  unitBtn.classList.toggle('selected', selectedCard === 'unit');
  buildingBtn.classList.toggle('selected', selectedCard === 'building');
}

function drawGrid() {
  ctx.save();
  const bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
  bg.addColorStop(0, '#eaeaff');
  bg.addColorStop(1, '#d0d0ff');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = 'rgba(0,0,0,0.1)';
  for (let i = 0; i <= CONFIG.grid.cols; i++) {
    ctx.beginPath();
    ctx.moveTo(i * CONFIG.grid.cell, 0);
    ctx.lineTo(i * CONFIG.grid.cell, canvas.height);
    ctx.stroke();
  }
  for (let j = 0; j <= CONFIG.grid.rows; j++) {
    ctx.beginPath();
    ctx.moveTo(0, j * CONFIG.grid.cell);
    ctx.lineTo(canvas.width, j * CONFIG.grid.cell);
    ctx.stroke();
  }

  // central line
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  const midY = (CONFIG.grid.rows / 2) * CONFIG.grid.cell;
  ctx.beginPath();
  ctx.moveTo(0, midY);
  ctx.lineTo(canvas.width, midY);
  ctx.stroke();
  ctx.restore();
}

function drawLog() {
  const jitter = state.log.jitter > 0 ? (Math.random() - 0.5) * 2 : 0;
  const x =
    state.log.x * CONFIG.grid.cell + CONFIG.grid.cell / 2 - CONFIG.log.width / 2;
  const y =
    state.log.y * CONFIG.grid.cell - CONFIG.log.height / 2 + jitter;
  const grad = ctx.createLinearGradient(0, y, 0, y + CONFIG.log.height);
  grad.addColorStop(0, '#c89b6a');
  grad.addColorStop(1, '#8b5e34');
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, CONFIG.log.width, CONFIG.log.height);
  ctx.strokeStyle = '#5c3a1e';
  ctx.strokeRect(x, y, CONFIG.log.width, CONFIG.log.height);
}

function drawBuildings() {
  state.buildings.forEach((b) => {
    const x = b.x * CONFIG.grid.cell + 4;
    const y = b.y * CONFIG.grid.cell + 4;
    ctx.fillStyle = '#666';
    ctx.fillRect(x, y, CONFIG.grid.cell - 8, CONFIG.grid.cell - 8);
  });
}

function drawUnits() {
  state.units.forEach((u) => {
    const ownerSide = state.players[u.owner]?.side;
    const color = ownerSide === 'top' ? '#3a3' : '#a33';
    const x = u.x * CONFIG.grid.cell + CONFIG.grid.cell / 2;
    const y = u.y * CONFIG.grid.cell + CONFIG.grid.cell / 2;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, CONFIG.unit.radiusPx, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawHover() {
  if (hover.x < 0 || hover.y < 0) return;
  const valid =
    state.phase === 'playing' &&
    canPlace(selectedCard, hover.x, hover.y) &&
    myMana() >= CONFIG.costs[selectedCard];
  ctx.fillStyle = valid ? 'rgba(0,255,0,0.3)' : 'rgba(255,0,0,0.3)';
  ctx.fillRect(
    hover.x * CONFIG.grid.cell,
    hover.y * CONFIG.grid.cell,
    CONFIG.grid.cell,
    CONFIG.grid.cell
  );
}

function render() {
  drawGrid();
  drawHover();
  drawLog();
  drawParticles();
  drawBuildings();
  drawUnits();

  // overlays
  overlay.classList.remove('visible');
  newGameBtn.style.display = 'none';
  if (state.phase === 'waiting') {
    overlayText.textContent = 'Ожидание второго игрока…';
    overlay.classList.add('visible');
  } else if (state.phase === 'countdown') {
    overlayText.textContent = state.countdown;
    overlay.classList.add('visible');
  } else if (state.phase === 'ended') {
    overlayText.textContent =
      state.winner === playerSide ? 'Победа!' : 'Поражение';
    overlay.classList.add('visible');
    newGameBtn.style.display = 'block';
  }
}

function loop(now) {
  const dt = now - lastTime;
  lastTime = now;
  update(dt);
  render();
  requestAnimationFrame(loop);
}

requestAnimationFrame((t) => {
  lastTime = t;
  loop(t);
});

