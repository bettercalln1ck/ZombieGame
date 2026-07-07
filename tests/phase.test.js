import { describe, it, expect } from 'vitest';
import { PHASE, gatherDuration, nextPhase, hpBonusForRound } from '../src/systems/phase.js';
import { TIMING } from '../src/config.js';

describe('phase machine', () => {
  it('round 1 gather is short, later rounds are longer', () => {
    expect(gatherDuration(1)).toBe(TIMING.gatherRound1);
    expect(gatherDuration(2)).toBe(TIMING.gather);
  });
  it('TITLE -> GATHER on start', () => {
    expect(nextPhase(PHASE.TITLE, { round: 1 })).toEqual({ phase: PHASE.GATHER, round: 1 });
  });
  it('GATHER -> DEFEND same round', () => {
    expect(nextPhase(PHASE.GATHER, { round: 1 })).toEqual({ phase: PHASE.DEFEND, round: 1 });
  });
  it('DEFEND -> ROUND_END same round', () => {
    expect(nextPhase(PHASE.DEFEND, { round: 3 })).toEqual({ phase: PHASE.ROUND_END, round: 3 });
  });
  it('ROUND_END advances the round into next GATHER', () => {
    expect(nextPhase(PHASE.ROUND_END, { round: 3 })).toEqual({ phase: PHASE.GATHER, round: 4 });
  });
  it('ROUND_END after round 10 -> VICTORY', () => {
    expect(nextPhase(PHASE.ROUND_END, { round: 10 })).toEqual({ phase: PHASE.VICTORY, round: 10 });
  });
  it('hpBonusForRound gives +5 on rounds 3,6,9 only', () => {
    expect(hpBonusForRound(3)).toBe(5);
    expect(hpBonusForRound(6)).toBe(5);
    expect(hpBonusForRound(4)).toBe(0);
  });
});
