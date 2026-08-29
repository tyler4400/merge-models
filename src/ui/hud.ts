/** HTML overlay: score, time, next, bottom hammer count, toast, title / win / lose. */
import "./hud.css";
import { tierDef, type TierId } from "../game/tiers";

export type HudHandlers = {
  onStart: () => void;
  onContinue: () => void;
  onRestart: () => void;
  onHammer: () => void;
};

function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export class Hud {
  readonly root: HTMLElement;
  private scoreEl: HTMLElement;
  private timeEl: HTMLElement;
  private nextImg: HTMLImageElement;
  private nextName: HTMLElement;
  private toastEl: HTMLElement;
  private titleOv: HTMLElement;
  private resultOv: HTMLElement;
  private resultTitle: HTMLElement;
  private resultScore: HTMLElement;
  private resultTime: HTMLElement;
  private resultHammers: HTMLElement;
  private continueBtn: HTMLButtonElement;
  private aimHint: HTMLElement;
  private hammerBtn: HTMLButtonElement;
  private hammerCount: HTMLElement;

  constructor(root: HTMLElement, handlers: HudHandlers) {
    this.root = root;
    root.innerHTML = `
      <div class="brand">合成大模型</div>
      <div class="bar">
        <div class="score-block">
          <span class="mark mark-coin" aria-hidden="true"></span>
          <div class="label">分数</div>
          <div class="score" data-score>0</div>
        </div>
        <div class="time-block">
          <div class="label">时间</div>
          <div class="time" data-time>0:00</div>
          <span class="mark mark-clock" aria-hidden="true"></span>
        </div>
        <div class="right">
          <div class="next">
            <div>
              <div class="label">下一颗</div>
              <div class="name" data-next-name>—</div>
            </div>
            <img data-next-img alt="next" />
          </div>
        </div>
      </div>
      <div class="fail-mark" aria-hidden="true"><span>⚠️ 小心！快要到顶啦！⚠️</span></div>
      <div class="toast" data-toast></div>
      <div class="aim-hint" data-aim>点一颗已静止的球 · 点空处取消</div>
      <div class="dock">
        <button class="hammer" data-hammer type="button">
          <svg class="mallet" viewBox="0 0 64 64" aria-hidden="true">
            <defs>
              <linearGradient id="mallet-head" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="#f7ead0"/>
                <stop offset="0.4" stop-color="#e4c894"/>
                <stop offset="1" stop-color="#c9a56a"/>
              </linearGradient>
              <linearGradient id="mallet-handle" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stop-color="#7a4a1c"/>
                <stop offset="0.45" stop-color="#c48a48"/>
                <stop offset="1" stop-color="#6a3c14"/>
              </linearGradient>
            </defs>
            <g transform="rotate(-38 32 34)">
              <rect x="29" y="20" width="7" height="36" rx="3.2" fill="url(#mallet-handle)"/>
              <rect x="13" y="8" width="38" height="18" rx="5" fill="url(#mallet-head)"/>
              <rect x="16" y="11" width="32" height="5" rx="2.4" fill="#fff6e4" opacity="0.55"/>
              <rect x="15" y="22" width="34" height="2.2" rx="1" fill="#a07840" opacity="0.35"/>
            </g>
          </svg>
          <span class="ham-count" data-hammer-count>x3</span>
        </button>
      </div>
      <div class="overlay show" data-title>
        <div class="card">
          <h1 class="title">合成大模型</h1>
          <p class="sub">侧视容器里掉玻璃球。两颗同级合成下一级。第一次做出 T-800 即通关，还能继续刷分。</p>
          <div class="actions">
            <button class="cta" data-start type="button">开始</button>
          </div>
        </div>
      </div>
      <div class="overlay" data-result>
        <div class="card">
          <h1 class="title" data-result-title>合成成功</h1>
          <p class="sub" data-result-sub></p>
          <div class="stats">
            <div class="stat"><b data-r-score>0</b><span>分数</span></div>
            <div class="stat"><b data-r-time>0:00</b><span>用时</span></div>
            <div class="stat"><b data-r-ham>3</b><span>锤子</span></div>
          </div>
          <div class="actions">
            <button class="cta" data-continue type="button">继续刷分</button>
            <button class="ghost" data-restart type="button">再来一局</button>
          </div>
        </div>
      </div>
    `;

    this.scoreEl = root.querySelector("[data-score]")!;
    this.timeEl = root.querySelector("[data-time]")!;
    this.nextImg = root.querySelector("[data-next-img]")!;
    this.nextName = root.querySelector("[data-next-name]")!;
    this.toastEl = root.querySelector("[data-toast]")!;
    this.titleOv = root.querySelector("[data-title]")!;
    this.resultOv = root.querySelector("[data-result]")!;
    this.resultTitle = root.querySelector("[data-result-title]")!;
    this.resultScore = root.querySelector("[data-r-score]")!;
    this.resultTime = root.querySelector("[data-r-time]")!;
    this.resultHammers = root.querySelector("[data-r-ham]")!;
    this.continueBtn = root.querySelector("[data-continue]")!;
    this.aimHint = root.querySelector("[data-aim]")!;
    this.hammerBtn = root.querySelector("[data-hammer]")!;
    this.hammerCount = root.querySelector("[data-hammer-count]")!;

    this.hammerBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      handlers.onHammer();
    });
    root.querySelector("[data-start]")!.addEventListener("click", () => handlers.onStart());
    this.continueBtn.addEventListener("click", () => handlers.onContinue());
    root.querySelector("[data-restart]")!.addEventListener("click", () => handlers.onRestart());
  }

  setScore(n: number): void {
    this.scoreEl.textContent = String(n);
  }

  setTime(sec: number): void {
    this.timeEl.textContent = fmtTime(sec);
  }

  setNext(tier: TierId): void {
    const d = tierDef(tier);
    this.nextImg.src = d.iconUrl;
    this.nextName.textContent = d.name;
  }

  setHammers(left: number, aiming: boolean): void {
    this.hammerCount.textContent = "x" + String(left);
    this.hammerBtn.dataset.empty = left <= 0 ? "1" : "0";
    this.hammerBtn.classList.toggle("active", aiming && left > 0);
    this.hammerBtn.disabled = left <= 0;
    this.aimHint.classList.toggle("show", aiming);
  }

  toast(name: string): void {
    this.toastEl.textContent = name;
    this.toastEl.classList.add("show");
    window.setTimeout(() => this.toastEl.classList.remove("show"), 900);
  }

  hideTitle(): void {
    this.titleOv.classList.remove("show");
  }

  showTitle(): void {
    this.titleOv.classList.add("show");
    this.resultOv.classList.remove("show");
  }

  showWin(score: number, sec: number, hammers: number): void {
    this.resultTitle.textContent = "合成成功";
    this.continueBtn.style.display = "";
    this.resultScore.textContent = String(score);
    this.resultTime.textContent = fmtTime(sec);
    this.resultHammers.textContent = String(hammers);
    this.resultOv.classList.add("show");
  }

  showLose(score: number, sec: number, hammers: number): void {
    this.resultTitle.textContent = "顶到头了";
    this.continueBtn.style.display = "none";
    this.resultScore.textContent = String(score);
    this.resultTime.textContent = fmtTime(sec);
    this.resultHammers.textContent = String(hammers);
    this.resultOv.classList.add("show");
  }

  hideResult(): void {
    this.resultOv.classList.remove("show");
  }
}
