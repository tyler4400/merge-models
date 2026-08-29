/** Procedural Web Audio: collide, merge (louder by tier), shatter, alarm, win. Unlock on first gesture. */
export class Sfx {
  private ctx: AudioContext | null = null;
  private unlocked = false;
  private alarm: { osc: OscillatorNode; gain: GainNode } | null = null;
  private lastCollide = 0;

  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    this.unlocked = true;
  }

  private dest(): AudioContext | null {
    if (!this.unlocked || !this.ctx) return null;
    return this.ctx;
  }

  collide(impulse: number): void {
    const ctx = this.dest();
    if (!ctx) return;
    const now = ctx.currentTime;
    if (now - this.lastCollide < 0.04) return;
    this.lastCollide = now;
    const vol = Math.min(0.18, 0.03 + impulse * 0.04);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = 180 + Math.random() * 80;
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
    osc.connect(g).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  merge(tier: number): void {
    const ctx = this.dest();
    if (!ctx) return;
    const now = ctx.currentTime;
    const vol = Math.min(0.42, 0.12 + tier * 0.028);
    const base = 320 + tier * 36;
    for (const [i, f] of [base, base * 1.5].entries()) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = i === 0 ? "sine" : "triangle";
      osc.frequency.setValueAtTime(f, now);
      osc.frequency.exponentialRampToValueAtTime(f * 1.25, now + 0.16);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(vol / (i + 1), now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
      osc.connect(g).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.3);
    }
  }

  shatter(): void {
    const ctx = this.dest();
    if (!ctx) return;
    const now = ctx.currentTime;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.22, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 1800;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.28, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    src.connect(filter).connect(g).connect(ctx.destination);
    src.start(now);
    const ping = ctx.createOscillator();
    const pg = ctx.createGain();
    ping.type = "sine";
    ping.frequency.setValueAtTime(1400, now);
    ping.frequency.exponentialRampToValueAtTime(700, now + 0.18);
    pg.gain.setValueAtTime(0.12, now);
    pg.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    ping.connect(pg).connect(ctx.destination);
    ping.start(now);
    ping.stop(now + 0.2);
  }

  setAlarm(on: boolean): void {
    const ctx = this.dest();
    if (!ctx) {
      return;
    }
    if (on && !this.alarm) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 620;
      g.gain.value = 0.0;
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.frequency.value = 3.2;
      lg.gain.value = 0.035;
      lfo.connect(lg).connect(g.gain);
      g.gain.setValueAtTime(0.04, ctx.currentTime);
      osc.connect(g).connect(ctx.destination);
      osc.start();
      lfo.start();
      this.alarm = { osc, gain: g };
    }
    if (!on && this.alarm) {
      try {
        this.alarm.osc.stop();
      } catch {
        /* already stopped */
      }
      this.alarm.osc.disconnect();
      this.alarm.gain.disconnect();
      this.alarm = null;
    }
  }

  win(): void {
    const ctx = this.dest();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [523, 659, 784, 1046];
    notes.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = f;
      const t = now + i * 0.12;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      osc.connect(g).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.36);
    });
  }
}
