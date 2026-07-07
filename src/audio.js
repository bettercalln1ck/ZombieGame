// Synthesized SFX via Web Audio. No asset files. Must be created after a user
// gesture (browsers block audio otherwise) — call unlock() on first input.
export class Audio {
  constructor() { this.ctx = null; this.enabled = true; }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  _tone(freq, dur, type = 'square', gain = 0.15) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g); g.connect(this.ctx.destination);
    osc.start(t); osc.stop(t + dur);
  }

  place()    { this._tone(180, 0.12, 'square', 0.2); }
  shoot()    { this._tone(320, 0.06, 'square', 0.12); }
  zombieHit(){ this._tone(120, 0.08, 'sawtooth', 0.1); }
  pickup()   { this._tone(660, 0.08, 'triangle', 0.18); this._tone(880, 0.08, 'triangle', 0.12); }
  baseHit()  { this._tone(70, 0.18, 'sawtooth', 0.25); }
  explosion(){ this._tone(90, 0.3, 'sawtooth', 0.3); }
  heal()     { this._tone(520, 0.1, 'sine', 0.2); this._tone(780, 0.12, 'sine', 0.15); }
  roundEnd() { this._tone(440, 0.15, 'triangle', 0.2); this._tone(660, 0.2, 'triangle', 0.2); }
  victory()  { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this._tone(f, 0.25, 'triangle', 0.2), i * 160)); }
  gameover() { [400, 300, 200, 120].forEach((f, i) => setTimeout(() => this._tone(f, 0.3, 'sawtooth', 0.25), i * 180)); }
}
