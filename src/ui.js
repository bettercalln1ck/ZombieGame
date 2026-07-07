import { DEFENSE_ORDER, DEFENSES, TOTAL_ROUNDS } from './config.js';
import { PHASE } from './systems/phase.js';

function fmtTime(s) {
  s = Math.max(0, Math.ceil(s));
  const m = Math.floor(s / 60);
  const ss = String(s % 60).padStart(2, '0');
  return `${m}:${ss}`;
}

export function drawHUD(ctx, game) {
  const { inventory, base, round, phase, phaseTime, selected } = game;

  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, ctx.canvas.width, 54);

  ctx.font = 'bold 18px system-ui'; ctx.textAlign = 'left';
  ctx.fillStyle = '#a9743b'; ctx.fillText(`Wood ${inventory.wood}`, 16, 34);
  ctx.fillStyle = '#b8c0cc'; ctx.fillText(`Metal ${inventory.metal}`, 150, 34);
  ctx.fillStyle = '#5cd65c'; ctx.fillText(`Food ${inventory.food}`, 290, 34);

  ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
  const phaseLabel = phase === PHASE.GATHER ? 'GATHER' : phase === PHASE.DEFEND ? 'DEFEND' : '';
  ctx.fillText(`Round ${round}/${TOTAL_ROUNDS}  —  ${phaseLabel}  ${fmtTime(phaseTime)}`, ctx.canvas.width / 2, 34);

  const bw = 220, bx = ctx.canvas.width - bw - 16, by = 18;
  ctx.fillStyle = '#000'; ctx.fillRect(bx, by, bw, 18);
  const frac = base.hp / base.maxHp;
  ctx.fillStyle = frac > 0.5 ? '#5cd65c' : frac > 0.25 ? '#e8c15a' : '#ff5252';
  ctx.fillRect(bx, by, bw * frac, 18);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(bx, by, bw, 18);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 13px system-ui'; ctx.textAlign = 'center';
  ctx.fillText(`BASE ${Math.ceil(base.hp)}/${base.maxHp}`, bx + bw / 2, by + 14);

  const tbY = ctx.canvas.height - 56;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, tbY, ctx.canvas.width, 56);
  ctx.textAlign = 'center';
  DEFENSE_ORDER.forEach((type, i) => {
    const def = DEFENSES[type];
    const x = 20 + i * 250;
    const isSel = selected === type;
    ctx.fillStyle = isSel ? def.color : 'rgba(255,255,255,0.12)';
    ctx.fillRect(x, tbY + 8, 236, 40);
    ctx.strokeStyle = isSel ? '#fff' : '#555'; ctx.lineWidth = 2; ctx.strokeRect(x, tbY + 8, 236, 40);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 14px system-ui';
    const cost = Object.entries(def.cost).map(([k, v]) => `${v}${k[0].toUpperCase()}`).join(' ');
    ctx.fillText(`[${def.key}] ${def.label}  (${cost})`, x + 118, tbY + 33);
  });

  ctx.fillStyle = '#5cd65c'; ctx.font = '13px system-ui'; ctx.textAlign = 'right';
  ctx.fillText('Press F to eat food (+10 HP)', ctx.canvas.width - 16, tbY - 8);
  ctx.textAlign = 'left';
}

export function drawTip(ctx, text) {
  if (!text) return;
  ctx.textAlign = 'center';
  ctx.font = 'bold 20px system-ui';
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(ctx.canvas.width / 2 - 300, 64, 600, 40);
  ctx.fillStyle = '#ffe066';
  ctx.fillText(text, ctx.canvas.width / 2, 90);
  ctx.textAlign = 'left';
}

function overlay(ctx, title, subtitle, color) {
  ctx.fillStyle = 'rgba(0,0,0,0.78)';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.textAlign = 'center';
  ctx.fillStyle = color; ctx.font = 'bold 64px system-ui';
  ctx.fillText(title, ctx.canvas.width / 2, ctx.canvas.height / 2 - 20);
  ctx.fillStyle = '#fff'; ctx.font = '24px system-ui';
  ctx.fillText(subtitle, ctx.canvas.width / 2, ctx.canvas.height / 2 + 40);
  ctx.textAlign = 'left';
}

export function drawTitle(ctx) {
  overlay(ctx, 'LAST STAND', 'Click or press Enter to start', '#7fd1ae');
  ctx.textAlign = 'center'; ctx.fillStyle = '#aaa'; ctx.font = '16px system-ui';
  ctx.fillText('WASD to move · 1-5 select defense · click to place · F to eat food', ctx.canvas.width / 2, ctx.canvas.height / 2 + 90);
  ctx.textAlign = 'left';
}

export function drawRoundEnd(ctx, game) {
  overlay(ctx, `Round ${game.round} Complete`, `Base ${Math.ceil(game.base.hp)}/${game.base.maxHp} HP · Press Enter for next round`, '#e8c15a');
}

export function drawVictory(ctx) {
  overlay(ctx, 'YOU SURVIVED', 'All 10 rounds cleared! Press Enter to play again', '#7fd1ae');
}

export function drawGameOver(ctx, game) {
  overlay(ctx, 'GAME OVER', `The base fell on round ${game.round}. Press Enter to retry`, '#ff5252');
}
