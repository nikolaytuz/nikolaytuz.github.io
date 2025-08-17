import { CONFIG } from './config.js';

export const state = {
  phase: 'waiting',
  players: {},
  units: [],
  buildings: [],
  log: { x: 0, y: 0, jitter: 0 },
  countdown: CONFIG.countdownSec,
  winner: null,
  message: null,

};

export let playerId = null;
export let playerSide = null;
export let manaShown = 0;

export function setPlayer(id, side) {
  playerId = id;
  playerSide = side;
}

export function applyServerState(s) {
  state.phase = s.phase;
  state.players = s.players || {};
  state.units = s.units || [];
  state.buildings = s.buildings || [];
  state.log = s.log || state.log;
  state.countdown = s.countdown;
  state.winner = s.winner || null;
  state.message = s.message || null;

}

export function myMana() {
  return state.players[playerId]?.mana || 0;
}

export function updateLocal(dt) {
  const target = myMana();
  manaShown += (target - manaShown) * Math.min(1, dt / 200);
}

