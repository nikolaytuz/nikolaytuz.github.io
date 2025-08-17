import { localState } from './state.js';

export const socket = io();

socket.on('joined', ({ id, side }) => {
  localState.playerId = id;
  localState.side = side;
});

socket.on('state', (data) => {
  localState.game = data;
  localState.phase = data.phase;
  localState.countdown = data.countdown;
  const me = data.players[localState.playerId];
  if (me) localState.mana = me.mana;
});

socket.on('gameOver', (data) => {
  localState.winner = data.winner;
  localState.phase = 'ended';
});

socket.on('opponentLeft', () => {
  localState.message = 'Противник покинул игру';
  localState.phase = 'waiting';
});
