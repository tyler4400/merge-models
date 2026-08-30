/** Procedural Web Audio: collide, merge, shatter, alarm, win. Unlock on first gesture. */
export class Sfx {
  private ctx: AudioContext | null = null;
  private unlocked = false;
  private alarm: { timer: number; osc: OscillatorNode | null; gain: GainNode | null } | null = null;
  private lastCollide = 0;
  private lastMerge = 0;
  private voices = 0;
  private readonly maxVoices = 2;

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

  private takeVoice(): boolean {
    if (this.voices >= this.maxVoices) return false;
    this.voices++;
    return true;
  }

  private releaseVoice(): void {
    this.voices = Math.max(0, this.voices - 1);
  }

  private disconnectAll(nodes: AudioNode[]): void {
    for (const n of nodes) {
      try {
        n.disconnect();
      } catch {
        /* already disconnected */
      }
    }
  }

  /** One voice slot shared by a handful of oscillators; disconnect everyone on ended. */
  private arm(src: AudioScheduledSourceNode, extras: AudioNode[], onLast: () => void): void {
    src.addEventListener(
      "ended",
      () => {
        this.disconnectAll([src, ...extras]);
        onLast();
      },
      { once: true },
    );
  }

  /** Short glass-marble clink. Global voice cap + slower gate so piles don't machine-gun. */
  collide(impulse: number): void {
    const ctx = this.dest();
    if (!ctx) return;
    const now = ctx.currentTime;
    if (now - this.lastCollide < 0.48) return;
    if (impulse < 2.8) return;
    if (!this.takeVoice()) return;
    this.lastCollide = now;

    const t = Math.min(1, Math.max(0, (impulse - 2.8) / 6));
    const dur = 0.07 + t * 0.07;
    const clickDur = 0.02 + t * 0.02;
    const vol = 0.016 + t * 0.022;
    let left = 0;
    const done = (): void => {
      left--;
      if (left <= 0) this.releaseVoice();
    };

    const nLen = Math.max(32, Math.floor(ctx.sampleRate * 0.04));
    const buf = ctx.createBuffer(1, nLen, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < nLen; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (nLen * 0.16));
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 1900 + t * 700;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 2700 + t * 800 + Math.random() * 220;
    bp.Q.value = 1.1;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(vol * 0.85, now);
    ng.gain.exponentialRampToValueAtTime(0.0001, now + clickDur);
    src.connect(hp).connect(bp).connect(ng).connect(ctx.destination);
    left++;
    this.arm(src, [hp, bp, ng], done);
    src.start(now);
    src.stop(now + 0.045);

    const f0 = 1600 + t * 1000 + Math.random() * 200;
    const ratios = [1, 1.28 + Math.random() * 0.08, 1.55 + Math.random() * 0.1];
    const nPartials = 2 + (Math.random() < 0.45 ? 1 : 0);
    for (let i = 0; i < nPartials; i++) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      const f = Math.min(2800, Math.max(1600, f0 * ratios[i] + (Math.random() - 0.5) * 70));
      osc.frequency.setValueAtTime(f, now);
      osc.frequency.exponentialRampToValueAtTime(f * 0.97, now + dur);
      const pvol = vol * (0.5 / (i + 1)) * (0.55 + t * 0.45);
      g.gain.setValueAtTime(Math.max(0.0001, pvol), now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      osc.connect(g).connect(ctx.destination);
      left++;
      this.arm(osc, [g], done);
      osc.start(now);
      osc.stop(now + dur + 0.012);
    }
  }

  /** Short bright glass-combine: high ding + sparkle. Throttled so chains don't stack. */
  merge(tier: number): void {
    const ctx = this.dest();
    if (!ctx) return;
    const now = ctx.currentTime;
    if (now - this.lastMerge < 0.2) return;
    if (!this.takeVoice()) return;
    this.lastMerge = now;

    const t = Math.max(0, Math.min(1, (tier - 1) / 9));
    const vol = 0.09 + t * 0.07;
    const dur = 0.12 + t * 0.08;
    const f0 = 2050 + t * 950;
    let left = 0;
    const done = (): void => {
      left--;
      if (left <= 0) this.releaseVoice();
    };

    const ratios = [1, 1.52, 2.18];
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      const f = f0 * ratios[i];
      osc.frequency.setValueAtTime(f, now);
      osc.frequency.exponentialRampToValueAtTime(f * 0.97, now + dur);
      const pvol = vol * (0.62 / (i + 1));
      g.gain.setValueAtTime(Math.max(0.0001, pvol), now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      osc.connect(g).connect(ctx.destination);
      left++;
      this.arm(osc, [g], done);
      osc.start(now);
      osc.stop(now + dur + 0.02);
    }

    const nLen = Math.max(32, Math.floor(ctx.sampleRate * 0.055));
    const buf = ctx.createBuffer(1, nLen, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < nLen; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (nLen * 0.2));
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 4500;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 5600 + t * 900;
    bp.Q.value = 1.35;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(vol * 0.5, now);
    ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
    src.connect(hp).connect(bp).connect(ng).connect(ctx.destination);
    left++;
    this.arm(src, [hp, bp, ng], done);
    src.start(now);
    src.stop(now + 0.07);
  }

  shatter(): void {
    const ctx = this.dest();
    if (!ctx) return;
    if (!this.takeVoice()) return;
    const now = ctx.currentTime;
    let left = 0;
    const done = (): void => {
      left--;
      if (left <= 0) this.releaseVoice();
    };

    const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.22, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (data.length * 0.35));
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 2400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.18, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    src.connect(filter).connect(g).connect(ctx.destination);
    left++;
    this.arm(src, [filter, g], done);
    src.start(now);
    src.stop(now + 0.22);

    const ping = ctx.createOscillator();
    const pg = ctx.createGain();
    ping.type = "sine";
    ping.frequency.setValueAtTime(2400, now);
    ping.frequency.exponentialRampToValueAtTime(980, now + 0.2);
    pg.gain.setValueAtTime(0.09, now);
    pg.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    ping.connect(pg).connect(ctx.destination);
    left++;
    this.arm(ping, [pg], done);
    ping.start(now);
    ping.stop(now + 0.22);

    const ping2 = ctx.createOscillator();
    const pg2 = ctx.createGain();
    ping2.type = "sine";
    ping2.frequency.setValueAtTime(3200, now);
    ping2.frequency.exponentialRampToValueAtTime(1400, now + 0.14);
    pg2.gain.setValueAtTime(0.05, now);
    pg2.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
    ping2.connect(pg2).connect(ctx.destination);
    left++;
    this.arm(ping2, [pg2], done);
    ping2.start(now);
    ping2.stop(now + 0.16);
  }

  setAlarm(on: boolean): void {
    const ctx = this.dest();
    if (!ctx) return;
    if (on && !this.alarm) {
      const stopTickNodes = (): void => {
        if (!this.alarm) return;
        if (this.alarm.osc) {
          try {
            this.alarm.osc.stop();
          } catch {
            /* already stopped */
          }
          this.disconnectAll([this.alarm.osc, this.alarm.gain].filter(Boolean) as AudioNode[]);
          this.alarm.osc = null;
          this.alarm.gain = null;
        }
      };
      const tick = (): void => {
        const ac = this.dest();
        if (!ac || !this.alarm) return;
        stopTickNodes();
        if (this.voices >= this.maxVoices) {
          this.alarm.timer = window.setTimeout(tick, 1400);
          return;
        }
        const t0 = ac.currentTime;
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = "sine";
        osc.frequency.value = 980;
        gain.gain.setValueAtTime(0.0024, t0);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.07);
        osc.connect(gain).connect(ac.destination);
        this.alarm.osc = osc;
        this.alarm.gain = gain;
        osc.addEventListener(
          "ended",
          () => {
            this.disconnectAll([osc, gain]);
            if (this.alarm && this.alarm.osc === osc) {
              this.alarm.osc = null;
              this.alarm.gain = null;
            }
          },
          { once: true },
        );
        osc.start(t0);
        osc.stop(t0 + 0.08);
        this.alarm.timer = window.setTimeout(tick, 1400);
      };
      this.alarm = { timer: 0, osc: null, gain: null };
      tick();
    }
    if (!on && this.alarm) {
      window.clearTimeout(this.alarm.timer);
      if (this.alarm.osc) {
        try {
          this.alarm.osc.stop();
        } catch {
          /* already stopped */
        }
        this.disconnectAll([this.alarm.osc, this.alarm.gain].filter(Boolean) as AudioNode[]);
      }
      this.alarm = null;
    }
  }

  win(): void {
    const ctx = this.dest();
    if (!ctx) return;
    if (!this.takeVoice()) return;
    const now = ctx.currentTime;
    const notes = [523, 659, 784, 1046];
    let left = notes.length;
    const done = (): void => {
      left--;
      if (left <= 0) this.releaseVoice();
    };
    notes.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = f;
      const t = now + i * 0.12;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      osc.connect(g).connect(ctx.destination);
      this.arm(osc, [g], done);
      osc.start(t);
      osc.stop(t + 0.36);
    });
  }
}
