import { CONFIG } from './config.js';
import { localState, lerp } from './state.js';
import { socket } from './net.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = CONFIG.grid.cols * CONFIG.grid.cell;
canvas.height = CONFIG.grid.rows * CONFIG.grid.cell;

const overlay = document.getElementById('overlay');
const manaNum = document.getElementById('manaNum');
const manaFill = document.getElementById('manaFill');
const cardUnit = document.getElementById('card-unit');
const cardBuilding = document.getElementById('card-building');

function selectCard(card) {
  localState.selected = card;
  cardUnit.classList.toggle('sel', card === 'unit');
  cardBuilding.classList.toggle('sel', card === 'building');
}
selectCard('unit');

cardUnit.onclick = () => selectCard('unit');
cardBuilding.onclick = () => selectCard('building');

function cycle(dir) {
  const arr = ['unit', 'building'];
  let idx = arr.indexOf(localState.selected);
  idx = (idx + dir + arr.length) % arr.length;
  selectCard(arr[idx]);
}

window.addEventListener('keydown', (e) => {
  if (e.key === '1') selectCard('unit');
  if (e.key === '2') selectCard('building');
  if (e.key === 'q' || e.key === 'Q') cycle(-1);
  if (e.key === 'e' || e.key === 'E') cycle(1);
});
window.addEventListener('wheel', (e) => cycle(e.deltaY > 0 ? 1 : -1));

let hoverCell = null;
canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor((e.clientX - rect.left) / CONFIG.grid.cell);
  const y = Math.floor((e.clientY - rect.top) / CONFIG.grid.cell);
  hoverCell = { x, y };
});
canvas.addEventListener('mouseleave', () => (hoverCell = null));

canvas.addEventListener('click', () => {
  if (!hoverCell) return;
  const { x, y } = hoverCell;
  if (canPlace(x, y)) {
    socket.emit('playCard', { type: localState.selected, x, y });
  } else {
    localState.shake = 8;
  }
});

function canPlace(x, y) {
  const g = localState.game;
  const { cols, rows } = CONFIG.grid;
  if (localState.phase !== 'playing') return false;
  if (x < 0 || x >= cols || y < 0 || y >= rows) return false;
  if (y === g.log.y) return false;
  if (localState.side === 'top' && y >= g.log.y) return false;
  if (localState.side === 'bottom' && y <= g.log.y) return false;
  if (localState.selected === 'building') {
    if (g.buildings.some((b) => b.x === x && b.y === y)) return false;
  }
  return true;
}

function drawField() {
  const cell = CONFIG.grid.cell;
  const cols = CONFIG.grid.cols;
  const rows = CONFIG.grid.rows;
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, '#eef');
  grad.addColorStop(1, '#ccd');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = 'rgba(0,0,0,0.1)';
  for (let i = 0; i <= cols; i++) {
    ctx.beginPath();
    ctx.moveTo(i * cell, 0);
    ctx.lineTo(i * cell, canvas.height);
    ctx.stroke();
  }
  for (let j = 0; j <= rows; j++) {
    ctx.beginPath();
    ctx.moveTo(0, j * cell);
    ctx.lineTo(canvas.width, j * cell);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, localState.game.log.y * cell + cell / 2);
  ctx.lineTo(canvas.width, localState.game.log.y * cell + cell / 2);
  ctx.stroke();
  ctx.lineWidth = 1;
  drawLog();
  localState.game.buildings.forEach((b) => {
    ctx.fillStyle = '#666';
    ctx.fillRect(b.x * cell + 4, b.y * cell + 4, cell - 8, cell - 8);
  });
  localState.game.units.forEach((u) => {
    ctx.fillStyle = u.owner === localState.playerId ? '#3c8' : '#c33';
    const cx = u.x * cell + cell / 2;
    const cy = u.y * cell + cell / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, CONFIG.unit.radiusPx, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.stroke();
  });
  if (hoverCell) {
    ctx.fillStyle = canPlace(hoverCell.x, hoverCell.y)
      ? 'rgba(0,255,0,0.3)'
      : 'rgba(255,0,0,0.3)';
    ctx.fillRect(
      hoverCell.x * cell,
      hoverCell.y * cell,
      cell,
      cell
    );
  }
}

let lastLogY = null;
function drawLog() {
  const cell = CONFIG.grid.cell;
  const logY = localState.game.log.y * cell + cell / 2;
  if (lastLogY !== null && lastLogY !== localState.game.log.y) {
    localState.logJitter = CONFIG.log.jitterMs / 16;
  }
  lastLogY = localState.game.log.y;
  let jitter = 0;
  if (localState.logJitter > 0) {
    jitter = (Math.random() - 0.5) * 4;
    localState.logJitter--;
  }
  const w = CONFIG.log.width;
  const h = CONFIG.log.height;
  const x = canvas.width / 2 - w / 2;
  const y = logY - h / 2 + jitter;
  const r = w / 2;
  ctx.save();
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#d2a679');
  g.addColorStop(1, '#8b5a2b');
  ctx.fillStyle = g;
  ctx.strokeStyle = '#5c3a1a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(x + r, y + h);
  ctx.arc(x + r, y + r, r, Math.PI / 2, -Math.PI / 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawOverlay() {
  overlay.innerHTML = '';
  overlay.style.display = 'none';
  if (localState.phase === 'waiting') {
    overlay.style.display = 'flex';
    overlay.textContent = localState.message || 'Ожидание второго игрока…';
  } else if (localState.phase === 'countdown') {
    overlay.style.display = 'flex';
    overlay.textContent = localState.countdown;
  } else if (localState.phase === 'ended') {
    overlay.style.display = 'flex';
    const txt = document.createElement('div');
    txt.textContent =
      localState.winner === localState.side ? 'Победа!' : 'Поражение';
    const btn = document.createElement('button');
    btn.textContent = 'Новая игра';
    btn.onclick = () => socket.emit('restart');
    overlay.appendChild(txt);
    overlay.appendChild(btn);
  }
}

function loop() {
  requestAnimationFrame(loop);
  localState.manaSmooth = lerp(localState.manaSmooth, localState.mana, 0.1);
  manaNum.textContent = Math.floor(localState.manaSmooth);
  manaFill.style.width = `${
    (localState.manaSmooth / CONFIG.mana.max) * 100
  }%`;
  cardUnit.disabled = localState.mana < CONFIG.costs.unit;
  cardBuilding.disabled = localState.mana < CONFIG.costs.building;
  if (localState.shake > 0) {
    const dx = (Math.random() - 0.5) * 4;
    const dy = (Math.random() - 0.5) * 4;
    ctx.save();
    ctx.translate(dx, dy);
    drawField();
    ctx.restore();
    localState.shake--;
  } else {
    drawField();
  }
  drawOverlay();
}
loop();
