// Tracks keyboard + mouse. No DOM tests; verified in-browser later.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.mouse = { x: 0, y: 0, down: false, clicked: false };
    this.pressed = new Set(); // edge-triggered this frame

    addEventListener('keydown', (e) => {
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));

    canvas.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouse.x = ((e.clientX - r.left) / r.width) * canvas.width;
      this.mouse.y = ((e.clientY - r.top) / r.height) * canvas.height;
    });
    canvas.addEventListener('mousedown', () => { this.mouse.down = true; this.mouse.clicked = true; });
    addEventListener('mouseup', () => { this.mouse.down = false; });
  }

  keyPressed(code) { return this.pressed.has(code); }
  isDown(code) { return this.keys.has(code); }

  endFrame() {
    this.pressed.clear();
    this.mouse.clicked = false;
  }
}
