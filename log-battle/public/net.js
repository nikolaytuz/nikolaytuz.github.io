import { setPlayer, applyServerState } from './state.js';

export const socket = io();

socket.on('joined', ({ id, side }) => {
  setPlayer(id, side);
});

socket.on('state', (s) => {
  applyServerState(s);
});

export function playCard(type, x, y) {
  socket.emit('playCard', { type, x, y });
}

export function requestRestart() {
  socket.emit('restart');
}

