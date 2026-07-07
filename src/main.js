import { Game } from './game.js';

const canvas = document.getElementById('game');
const game = new Game(canvas);

let last = performance.now();
function frame(now) {
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.05) dt = 0.05;
  game.update(dt);
  game.draw();
  game.input.endFrame();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
