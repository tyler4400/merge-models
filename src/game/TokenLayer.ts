/** 2D token overlay: icon fills the circle; per-tier colored rings are stroked on top. */
import { CAMERA, DROP, FAIL_LINE_Y, TANK, VIEW } from "./constants";
import type { Ball } from "./Ball";
import tok01 from "../assets/tokens/01.png";
import tok02 from "../assets/tokens/02.png";
import tok03 from "../assets/tokens/03.png";
import tok04 from "../assets/tokens/04.png";
import tok05 from "../assets/tokens/05.png";
import tok06 from "../assets/tokens/06.png";
import tok07 from "../assets/tokens/07.png";
import tok08 from "../assets/tokens/08.png";
import tok09 from "../assets/tokens/09.png";
import tok10 from "../assets/tokens/10.png";
import courtyardUrl from "../assets/levels/01-courtyard.png";
import { getTier, type TierId } from "./tiers";

const TOKEN_URL: Record<TierId, string> = {
  1: tok01,
  2: tok02,
  3: tok03,
  4: tok04,
  5: tok05,
  6: tok06,
  7: tok07,
  8: tok08,
  9: tok09,
  10: tok10,
};

const images = new Map<number, HTMLImageElement>();

export function preloadTokens(): Promise<void> {
  const ids: TierId[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  return Promise.all(
    ids.map(
      (id) =>
        new Promise<void>((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            images.set(id, img);
            resolve();
          };
          img.onerror = () => reject(new Error(`token ${id} failed`));
          img.src = TOKEN_URL[id];
        }),
    ),
  ).then(() => undefined);
}

export type TokenDrawOpts = {
  dropX?: number;
  guideAlpha?: number;
  warn?: boolean;
};

const SNIP_MS = 0.18;
const HELD_FILL_ALPHA = 0.5;
const HELD_RING_ALPHA = 0.88;
/** Ring thickness as a fraction of token radius (crisp at 390px). */
const RING_WIDTH_FRAC = 0.095;

type BurstShard = {
  a0: number;
  a1: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  spin: number;
  r: number;
};

type BurstSpark = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  gold: boolean;
  life: number;
  maxLife: number;
};

type Burst = {
  sx: number;
  sy: number;
  r: number;
  t: number;
  dur: number;
  snip: number;
  img: HTMLImageElement;
  baseSpin: number;
  shards: BurstShard[];
  sparks: BurstSpark[];
};

export class TokenLayer {
  readonly el: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  private readonly game: HTMLCanvasElement;
  private readonly bursts: Burst[] = [];
  private lastBurstTs = 0;

  constructor(gameCanvas: HTMLCanvasElement) {
    this.game = gameCanvas;
    const stage = gameCanvas.parentElement;
    if (stage && !document.getElementById("yard")) {
      const yard = document.createElement("img");
      yard.id = "yard";
      yard.src = courtyardUrl;
      yard.alt = "";
      yard.setAttribute("aria-hidden", "true");
      stage.insertBefore(yard, stage.firstChild);
    }
    const el = document.createElement("canvas");
    el.id = "tokens";
    el.setAttribute("aria-hidden", "true");
    stage?.appendChild(el);
    const ctx = el.getContext("2d");
    if (!ctx) throw new Error("token canvas 2d");
    this.el = el;
    this.ctx = ctx;
    this.syncSize();
  }

  private syncSize(): void {
    const w = this.game.clientWidth;
    const h = this.game.clientHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const bw = Math.max(1, Math.round(w * dpr));
    const bh = Math.max(1, Math.round(h * dpr));
    if (this.el.width !== bw || this.el.height !== bh) {
      this.el.width = bw;
      this.el.height = bh;
    }
  }

  worldToScreen(x: number, y: number): { sx: number; sy: number } {
    const w = this.el.width;
    const h = this.el.height;
    const sx = ((x + VIEW.halfW) / (2 * VIEW.halfW)) * w;
    const sy = ((VIEW.halfH - (y - CAMERA.targetY)) / (2 * VIEW.halfH)) * h;
    return { sx, sy };
  }

  cssToWorld(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.game.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    const nx = (clientX - rect.left) / w;
    const ny = (clientY - rect.top) / h;
    const x = nx * 2 * VIEW.halfW - VIEW.halfW;
    const y = CAMERA.targetY + VIEW.halfH - ny * 2 * VIEW.halfH;
    return { x, y };
  }

  radiusPx(radius: number): number {
    return (radius / (2 * VIEW.halfW)) * this.el.width;
  }

  /** Snapshot the token and spawn a prune-snip shatter in canvas pixel space. */
  burst(ball: Ball): void {
    const img = images.get(ball.tier);
    if (!img) return;
    const p = ball.mesh.getAbsolutePosition();
    const { sx, sy } = this.worldToScreen(p.x, p.y);
    const r = Math.max(4, this.radiusPx(ball.radius * ball.mesh.scaling.x));
    const dur = 0.46 + Math.random() * 0.12;
    const n = 8 + Math.floor(Math.random() * 5);
    const weights: number[] = [];
    for (let i = 0; i < n; i++) weights.push(0.62 + Math.random() * 0.76);
    const sum = weights.reduce((a, b) => a + b, 0);
    let ang = Math.random() * Math.PI * 2;
    const shards: BurstShard[] = [];
    const baseSpin = ball.spin;
    for (let i = 0; i < n; i++) {
      const a0 = ang;
      ang += (weights[i] / sum) * Math.PI * 2;
      const a1 = ang;
      const mid = (a0 + a1) * 0.5 + baseSpin;
      const speed = r * (2.6 + Math.random() * 2.4);
      shards.push({
        a0,
        a1,
        x: sx,
        y: sy,
        vx: Math.cos(mid) * speed,
        vy: Math.sin(mid) * speed,
        rot: 0,
        spin: (Math.random() - 0.5) * 7.5,
        r,
      });
    }
    const sparks: BurstSpark[] = [];
    const ns = 10 + Math.floor(Math.random() * 7);
    for (let i = 0; i < ns; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = r * (3.2 + Math.random() * 5.4);
      const life = 0.26 + Math.random() * 0.28;
      sparks.push({
        x: sx,
        y: sy,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - r * 0.55,
        r: Math.max(1.15, r * (0.032 + Math.random() * 0.05)),
        gold: Math.random() < 0.55,
        life,
        maxLife: life,
      });
    }
    this.bursts.push({
      sx,
      sy,
      r,
      t: 0,
      dur,
      snip: Math.random() * Math.PI,
      img,
      baseSpin,
      shards,
      sparks,
    });
  }

  draw(balls: Ball[], opts: TokenDrawOpts = {}): void {
    this.syncSize();
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.el.width, this.el.height);
    this.paintFailLine(ctx, !!opts.warn);
    if ((opts.guideAlpha ?? 0) > 0.01) {
      this.paintDropGuide(ctx, opts.dropX ?? 0, opts.guideAlpha ?? 0);
    }
    const sorted = balls.slice().sort((a, b) => a.mesh.position.z - b.mesh.position.z);
    for (const ball of sorted) {
      const scale = ball.mesh.scaling.x;
      if (scale < 0.04) continue;
      const img = images.get(ball.tier);
      if (!img) continue;
      const p = ball.mesh.getAbsolutePosition();
      const { sx, sy } = this.worldToScreen(p.x, p.y);
      const r = this.radiusPx(ball.radius * scale);
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(ball.spin);
      ctx.globalAlpha = (ball.held ? HELD_FILL_ALPHA : 1) * ball.logoAlpha;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(img, -r, -r, r * 2, r * 2);
      ctx.restore();
      this.strokeTierRing(ctx, sx, sy, r, ball.tier, ball.held, ball.logoAlpha);
    }
    this.tickBursts();
    this.paintBursts(ctx);
  }


  /** Color ring after clip restore so the stroke is not clipped away. */
  private strokeTierRing(
    ctx: CanvasRenderingContext2D,
    sx: number,
    sy: number,
    r: number,
    tier: TierId,
    held: boolean,
    logoAlpha: number,
  ): void {
    const color = getTier(tier).ring;
    const ringW = Math.max(1.8, r * RING_WIDTH_FRAC);
    const ringAlpha = (held ? HELD_RING_ALPHA : 1) * logoAlpha;
    const radius = Math.max(1, r - ringW * 0.22);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = color;
    ctx.globalAlpha = ringAlpha * 0.38;
    ctx.lineWidth = ringW * 1.4;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = ringAlpha;
    ctx.lineWidth = ringW;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = ringAlpha * 0.72;
    ctx.strokeStyle = "rgba(255, 252, 245, 0.62)";
    ctx.lineWidth = Math.max(1, ringW * 0.22);
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(1, r - ringW * 0.92), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private tickBursts(): void {
    const now = performance.now();
    const dt = this.lastBurstTs ? Math.min(0.05, (now - this.lastBurstTs) / 1000) : 0;
    this.lastBurstTs = now;
    if (!this.bursts.length) return;
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.t += dt;
      const g = b.r * 8.4;
      for (const s of b.shards) {
        s.vy += g * dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.rot += s.spin * dt;
        s.vx *= 1 - 0.55 * dt;
      }
      for (let k = b.sparks.length - 1; k >= 0; k--) {
        const sp = b.sparks[k];
        sp.life -= dt;
        sp.vy += g * 1.15 * dt;
        sp.x += sp.vx * dt;
        sp.y += sp.vy * dt;
        if (sp.life <= 0) b.sparks.splice(k, 1);
      }
      if (b.t >= b.dur) this.bursts.splice(i, 1);
    }
  }

  private paintBursts(ctx: CanvasRenderingContext2D): void {
    for (const b of this.bursts) {
      const u = Math.min(1, b.t / b.dur);
      const fade = u < 0.52 ? 1 : 1 - (u - 0.52) / 0.48;
      for (const s of b.shards) {
        const gap = 0.035;
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.rot + b.baseSpin);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, s.r, s.a0 + gap, s.a1 - gap);
        ctx.closePath();
        ctx.clip();
        ctx.globalAlpha = fade;
        ctx.drawImage(b.img, -s.r, -s.r, s.r * 2, s.r * 2);
        ctx.restore();
      }
      this.paintSnip(ctx, b);
      this.paintRing(ctx, b, u);
      for (const sp of b.sparks) {
        const a = Math.max(0, sp.life / sp.maxLife);
        ctx.save();
        ctx.globalAlpha = a * a;
        ctx.fillStyle = sp.gold ? "rgba(255, 214, 120, 1)" : "rgba(255, 252, 245, 1)";
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, sp.r * (0.55 + 0.45 * a), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  private paintSnip(ctx: CanvasRenderingContext2D, b: Burst): void {
    if (b.t >= SNIP_MS) return;
    const u = b.t / SNIP_MS;
    const fade = 1 - u;
    const len = b.r * (0.42 + u * 1.05);
    const bow = b.r * 0.16 * (1 - u);
    ctx.save();
    ctx.translate(b.sx, b.sy);
    ctx.lineCap = "round";
    ctx.globalAlpha = fade;
    const strokes: Array<{ ang: number; color: string; width: number }> = [
      { ang: b.snip, color: "rgba(255, 252, 242, 0.95)", width: Math.max(1.4, b.r * 0.055) },
      { ang: b.snip + Math.PI * 0.46, color: "rgba(255, 232, 186, 0.9)", width: Math.max(1.2, b.r * 0.042) },
    ];
    for (const st of strokes) {
      const c = Math.cos(st.ang);
      const s = Math.sin(st.ang);
      const nx = -s;
      const ny = c;
      ctx.strokeStyle = st.color;
      ctx.lineWidth = st.width;
      ctx.beginPath();
      ctx.moveTo(-c * len, -s * len);
      ctx.quadraticCurveTo(nx * bow, ny * bow, c * len, s * len);
      ctx.stroke();
    }
    ctx.restore();
  }

  private paintRing(ctx: CanvasRenderingContext2D, b: Burst, u: number): void {
    const ringU = Math.min(1, b.t / Math.min(0.42, b.dur));
    ctx.save();
    ctx.translate(b.sx, b.sy);
    ctx.globalAlpha = 0.55 * (1 - ringU) * (1 - u * 0.25);
    ctx.strokeStyle = "rgba(255, 248, 236, 0.95)";
    ctx.lineWidth = Math.max(1.1, b.r * 0.04);
    ctx.beginPath();
    ctx.arc(0, 0, b.r * (0.72 + ringU * 1.65), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private paintFailLine(ctx: CanvasRenderingContext2D, warn: boolean): void {
    const half = TANK.innerWidth / 2;
    const a = this.worldToScreen(-half, FAIL_LINE_Y);
    const b = this.worldToScreen(half, FAIL_LINE_Y);
    const dpr = this.el.width / Math.max(1, this.game.clientWidth);
    const dash = 14 * dpr;
    const gap = 9 * dpr;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineWidth = (warn ? 3.4 : 2.6) * dpr;
    ctx.setLineDash([dash, gap]);
    ctx.lineDashOffset = 0;
    ctx.strokeStyle = warn ? "#ff2414" : "#e83a2a";
    ctx.globalAlpha = warn ? 0.98 : 0.82;
    ctx.beginPath();
    ctx.moveTo(a.sx, a.sy);
    ctx.lineTo(b.sx, b.sy);
    ctx.stroke();
    ctx.setLineDash([gap, dash]);
    ctx.lineDashOffset = -dash;
    ctx.strokeStyle = warn ? "#fff4ee" : "#fff8f4";
    ctx.globalAlpha = warn ? 0.95 : 0.72;
    ctx.beginPath();
    ctx.moveTo(a.sx, a.sy);
    ctx.lineTo(b.sx, b.sy);
    ctx.stroke();
    ctx.restore();
  }

  private paintDropGuide(ctx: CanvasRenderingContext2D, dropX: number, alpha: number): void {
    const top = this.worldToScreen(dropX, DROP.y);
    const bot = this.worldToScreen(dropX, 0.12);
    const dpr = this.el.width / Math.max(1, this.game.clientWidth);
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineWidth = 1.8 * dpr;
    ctx.setLineDash([10 * dpr, 7 * dpr]);
    ctx.strokeStyle = "rgba(242, 199, 107, 1)";
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(top.sx, top.sy);
    ctx.lineTo(bot.sx, bot.sy);
    ctx.stroke();
    ctx.restore();
  }

  hitTest(pointerX: number, pointerY: number, balls: Ball[]): Ball | null {
    const gw = Math.max(1, this.game.width);
    const gh = Math.max(1, this.game.height);
    const wx = (pointerX / gw) * 2 * VIEW.halfW - VIEW.halfW;
    const wy = CAMERA.targetY + VIEW.halfH - (pointerY / gh) * 2 * VIEW.halfH;
    return this.pickAtWorld(wx, wy, balls);
  }

  hitTestCss(clientX: number, clientY: number, balls: Ball[]): Ball | null {
    const { x, y } = this.cssToWorld(clientX, clientY);
    return this.pickAtWorld(x, y, balls);
  }

  private pickAtWorld(wx: number, wy: number, balls: Ball[]): Ball | null {
    let best: Ball | null = null;
    let bestD = Infinity;
    for (const ball of balls) {
      const p = ball.mesh.getAbsolutePosition();
      const r = ball.radius * ball.mesh.scaling.x;
      const dx = wx - p.x;
      const dy = wy - p.y;
      const d = dx * dx + dy * dy;
      if (d <= r * r && d < bestD) {
        best = ball;
        bestD = d;
      }
    }
    return best;
  }
}
