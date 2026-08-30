/** HTML overlay: score, time, next, bottom hammer count, toast, title / win / lose. */
import "./hud.css";
import { FAIL_LINE_Y, SCREEN, TANK } from "../game/constants";
import { tierDef, type TierId } from "../game/tiers";
import titleUrl from "../assets/ui/title.png";

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
  private failMark: HTMLElement;

  constructor(root: HTMLElement, handlers: HudHandlers) {
    this.root = root;
    root.innerHTML = `
      <div class="brand"><img data-brand-img alt="合成大模型" /></div>
      <div class="bar">
        <div class="score-block">
          <span class="mark mark-coin" aria-hidden="true"></span>
          <div class="label">分数</div>
          <div class="score" data-score>0</div>
        </div>
        <div class="time-block">
          <span class="mark mark-clock" aria-hidden="true"></span>
          <div class="label">时间</div>
          <div class="time" data-time>0:00</div>
        </div>
        <div class="next">
          <div>
            <div class="label">下一颗</div>
            <div class="name" data-next-name>—</div>
          </div>
          <img data-next-img alt="next" />
        </div>
      </div>
      <div class="fail-mark" aria-hidden="true"><span>⚠️ 小心！快要到顶啦！⚠️</span></div>
      <div class="toast" data-toast></div>
      <div class="aim-hint" data-aim>点一颗已静止的球 · 点空处取消</div>
      <div class="dock">
        <button class="hammer" data-hammer type="button">
          <span class="ham-count" data-hammer-count>x3</span>
        </button>
      </div>
      <div class="overlay show" data-title>
        <div class="card">
          <img class="title-art" data-title-img alt="合成大模型" />
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

    this.failMark = root.querySelector(".fail-mark") as HTMLElement;
    const worldPerPx = TANK.innerWidth / SCREEN.jarInnerW;
    const failTopPx = SCREEN.jarTop + (TANK.innerHeight - FAIL_LINE_Y) / worldPerPx;
    this.failMark.style.top = `${(failTopPx / SCREEN.h) * 100}%`;
    this.failMark.style.left = `${(SCREEN.side / SCREEN.w) * 100}%`;
    this.failMark.style.width = `${(SCREEN.jarInnerW / SCREEN.w) * 100}%`;

    const brandImg = root.querySelector("[data-brand-img]") as HTMLImageElement;
    brandImg.src = titleUrl;
    const titleImg = root.querySelector("[data-title-img]") as HTMLImageElement;
    titleImg.src = titleUrl;

    this.hammerBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      handlers.onHammer();
    });
    root.querySelector("[data-start]")!.addEventListener("click", () => handlers.onStart());
    this.continueBtn.addEventListener("click", () => handlers.onContinue());
    root.querySelector("[data-restart]")!.addEventListener("click", () => handlers.onRestart());
  }


  setWarn(on: boolean): void {
    this.failMark.classList.toggle("show", on);
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
