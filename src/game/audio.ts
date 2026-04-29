export class TonePlayer {
  private ctx: AudioContext | null = null;

  init() {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!this.ctx && Ctor) this.ctx = new Ctor();
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
  }

  tone(freq: number, dur = 0.08, type: OscillatorType = 'sine', vol = 0.04, slide = 0) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(50, freq + slide), now + dur);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(vol, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + dur + 0.03);
  }
}
