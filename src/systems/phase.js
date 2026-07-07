import { TIMING, TOTAL_ROUNDS, HP_BONUS_ROUNDS, HP_BONUS_AMOUNT } from '../config.js';

export const PHASE = {
  TITLE: 'TITLE',
  GATHER: 'GATHER',
  DEFEND: 'DEFEND',
  ROUND_END: 'ROUND_END',
  VICTORY: 'VICTORY',
  GAMEOVER: 'GAMEOVER',
};

export function gatherDuration(round) {
  return round === 1 ? TIMING.gatherRound1 : TIMING.gather;
}

export function hpBonusForRound(round) {
  return HP_BONUS_ROUNDS.includes(round) ? HP_BONUS_AMOUNT : 0;
}

export function nextPhase(phase, { round }) {
  switch (phase) {
    case PHASE.TITLE:
      return { phase: PHASE.GATHER, round };
    case PHASE.GATHER:
      return { phase: PHASE.DEFEND, round };
    case PHASE.DEFEND:
      return { phase: PHASE.ROUND_END, round };
    case PHASE.ROUND_END:
      if (round >= TOTAL_ROUNDS) return { phase: PHASE.VICTORY, round };
      return { phase: PHASE.GATHER, round: round + 1 };
    default:
      return { phase, round };
  }
}
