/** 2D token overlay: icon fills the circle, tinted ring from baked PNGs. */
import { CAMERA, VIEW } from "./constants";
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

export class TokenLayer {
  readonly el: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  private readonly game: HTMLCanvasElement;

  constructor(gameCanvas: HTMLCanvasElement) {
    this.game = gameCanvas;
    const el = document.createElement("canvas");
    el.id = "tokens";
    el.setAttribute("aria-hidden", "true");
    gameCanvas.parentElement?.appendChild(el);
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

  radiusPx(radius: number): number {
    return (radius / (2 * VIEW.halfW)) * this.el.width;
  }

  draw(balls: Ball[]): void {
    this.syncSize();
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.el.width, this.el.height);
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

  hitTest(pointerX: number, pointerY: number, balls: Ball[]): Ball | null {
    const gw = Math.max(1, this.game.width);
    const gh = Math.max(1, this.game.height);
    const wx = (pointerX / gw) * 2 * VIEW.halfW - VIEW.halfW;
    const wy = CAMERA.targetY + VIEW.halfH - (pointerY / gh) * 2 * VIEW.halfH;
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
