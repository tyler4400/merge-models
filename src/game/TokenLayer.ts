/** 2D token overlay: icon fills the circle, tinted ring from baked PNGs. */
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
import type { TierId } from "./tiers";

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

export class TokenLayer {
  readonly el: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  private readonly game: HTMLCanvasElement;

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
      ctx.globalAlpha = ball.logoAlpha;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(img, -r, -r, r * 2, r * 2);
      ctx.restore();
    }
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
