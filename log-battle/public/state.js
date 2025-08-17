export const localState = {
  playerId: null,
  side: null,
  selected: 'unit',
  mana: 0,
  manaSmooth: 0,
  phase: 'waiting',
  countdown: 0,
  game: { players: {}, units: [], buildings: [], log: { y: 0, jitter: 0 } },
  winner: null,
  message: '',
  shake: 0,
  logJitter: 0
};

export function lerp(a, b, t) {
  return a + (b - a) * t;
}
