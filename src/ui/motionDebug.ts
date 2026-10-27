import type { Game } from "../game/Game";

/** 无参数时不创建节点、不读取诊断、不启动定时器。 */
export function mountMotionDebug(game: Game, search = location.search): () => void {
  if (!new URLSearchParams(search).getAll("debug").some((value) => value.includes("motion"))) return () => {};
  const panel = document.createElement("pre");
  panel.dataset.motionDebug = "";
  panel.style.cssText = "position:fixed;top:6px;left:6px;z-index:2147483647;pointer-events:none;margin:0;padding:7px;border-radius:5px;background:rgba(0,0,0,.7);color:#fff;font:11px/1.4 monospace;white-space:pre-wrap;max-width:calc(100vw - 26px);overflow-wrap:anywhere";
  document.body.appendChild(panel);
  const render = () => {
    const { tilt: t, shake: s, phase, shakeFailPause, armed, warning } = game.getDiagnostics();
    const source = s.source === "high-pass" ? "高通回退" : s.source;
    panel.textContent = [
      `motion ${t.listening ? "ON" : "OFF"} | ${t.visibilityState} | phase ${phase}`,
      `摇晃 ${armed ? "已就绪" : warning ? "未就绪(非游戏阶段)" : "未就绪(无警告)"} | warning ${warning}`,
      `事件 ${t.eventsPerSecond}/s | 距上次 ${t.lastMotionAgoMs === null ? "未收到" : `${Math.round(t.lastMotionAgoMs)}ms`} | 重挂 ${t.reattachCount}`,
      `来源 ${source} | |a| ${s.magnitude.toFixed(1)}m/s² | Accel ${t.genericActive ? "ON" : "OFF"}`,
      `峰 ${s.peaks} | 反转 ${s.reversals} | 冷却 ${s.cooldownSec.toFixed(1)}s | 触发 ${s.triggerCount}`,
      `倾角 平滑 ${t.thetaDeg.toFixed(1)}° / 目标 ${t.targetDeg.toFixed(1)}° | 冻结 ${t.frozenSec.toFixed(1)}s | 失败暂停 ${shakeFailPause.toFixed(1)}s`,
      t.lastError ? `错误 @${Math.round(t.lastError.atMs)}ms ${t.lastError.message}` : "错误 —",
    ].join("\n");
  };
  render();
  const timer = window.setInterval(render, 250);
  return () => { window.clearInterval(timer); panel.remove(); };
}
