# 训练大模型

[![自动部署](https://github.com/tyler4400/merge-models/actions/workflows/deploy.yml/badge.svg?branch=master)](https://github.com/tyler4400/merge-models/actions/workflows/deploy.yml)

侧视容器里往下掉玻璃球，两颗同级合成下一级。第一次做出 **T-800** 即通关，之后可以继续刷分。休闲局，不是刷分肝游。

> 训练大模型，同级的会练成下一代。看你能不能练出统一全世界的大模型。

<p align="center">
  <img src="docs/shots/play.jpg" alt="对局：院子罐子里的合成圆片" width="280">
  <img src="docs/shots/title.jpg" alt="标题页" width="280">
</p>

完整玩法见 [docs/BRIEF.md](docs/BRIEF.md)。图标出处见 [docs/ASSET_SOURCES.md](docs/ASSET_SOURCES.md)。

## 这是什么仓库

这是一个 **Godogen 薄仓库（thin repo）**：先用 Godogen 的 publish.sh 写入运行时清单和引擎指南，再由宿主 agent 在仓库里把游戏本身搭出来。

源仓库：`/workspace/godogen-src`

发布命令（只做一次，不要 --force 以免清掉游戏文件）：

```
/workspace/godogen-src/publish.sh --engine babylon --agent codex --out /workspace/merge-models
mkdir -p .cursor/skills
cp -R .agents/skills/asset-gen .cursor/skills/asset-gen
```

发布后仓库里自带：

| 文件 | 作用 |
|---|---|
| `AGENTS.md` | Codex 运行时清单（怎么判断进度、资产怎么生成） |
| `babylon.md` | Babylon.js 引擎指南（Vite、Havok wasm、侧效 import、截图） |
| `.agents/skills/asset-gen` | Codex 资产技能 |
| `.cursor/skills/asset-gen` | 同一技能的 Cursor 副本，方便本机宿主用 |

游戏代码、Vite 脚手架、图标、简报都是发布之后写进去的，不是 Godogen 自带的。

## 和官方 Godogen 的差异

| 点 | 官方 Godogen | 本仓库 |
|---|---|---|
| 宿主 | Claude Code 或 Codex CLI | Cursor 宿主（skills 同步到 `.cursor/skills`） |
| 付费资产 | asset-gen（Gemini / Grok / Tripo3D），先问再花 | **不用付费资产生成**。十个官方图标已经收集好了 |
| 端口 | 指南里写 5173 | **5175**（避开其他 Vite） |
| gitignore | 默认忽略 AGENTS.md / babylon.md / .agents（可再发布） | 工程化仓库，这些文件入库，方便阅读 |
| 证明方式 | 无人值守时录 15-20s 视频 | 可玩页面 + 风格确认截图 screenshots/ui-play.png |

## 怎么跑

需要 Node 22+。在仓库根目录安装依赖后执行开发服务器（脚本名 dev）。

打开 **http://127.0.0.1:5175**。`vite.config.ts` 绑定 `host: true`、`port: 5175`、`allowedHosts: true`。

`build` 脚本跑 tsc + vite，只当编译门禁，不是「能玩」的证明。

Havok 直接用 `await HavokPhysics()` 初始化。Vite 根据包内的 `new URL` 将 wasm 输出为 `dist/assets/HavokPhysics-<hash>.wasm`，内容变化会更新 URL，因此适用 `/assets/*` 的一年 immutable 缓存。开发模式通过 `optimizeDeps.exclude` 排除 `@babylonjs/havok`：预打包会把依赖移到 `node_modules/.vite/deps` 并改变 `import.meta.url`，导致 wasm 相对路径失效；排除后从包原位置加载。

## 怎么玩

1. 标题页点「开始」。
2. 左右移动手持球，松手 / 点击 / 空格投放。只能投 1-4 级。可快速连点，不必等上一颗停稳。
3. 两颗同级碰到变成下一级，中央 toast 显示名字。
4. 第一次做出 T-800 即通关结算。可选「继续刷分」或「再来一局」。
5. 堆住的球顶越过警戒线约 2 秒即失败。刚落下 0.8 秒内、以及还在下落穿过红线的，不亮警告。
6. 点底栏锤子，再点一颗已落地的球砸碎（全局限 3 次）。点空处取消；点到还不能砸的球继续瞄准。

桌面：A / D 或方向键或鼠标移动；点击 / 空格投放；S 模拟摇晃（强度 0.8，共用两秒冷却）。
手机：手指拖动手持球，松手投放。画布禁止滚动和缩放。
点击后在点击处的 X 下落；倾斜手机可改变缸内重力方向，最大约 45°，重力大小保持 24。
用力往返晃手机可让全缸已投放的球沿共用方向向上弹起，再反向横晃；可以飞出缸口，落回缸内继续合成，落在缸外则碎裂销毁，仅对局和锤子瞄准阶段可触发摇晃。

音频在第一次手势时解锁。

## 源码地图

```
src/
  main.ts                 启动：canvas、Engine、进 createApp
  app/createApp.ts        建场景、开 Havok、挂 Game 与 HUD
  game/
    Game.ts               阶段机：title / playing / won / dead / hammerAim
    constants.ts          容器尺寸、警戒线、锤子数、静止阈值
    tilt.ts               倾斜重力、手机权限与运动事件订阅
    shake.ts              纯逻辑摇晃检测、高通回退、共用方向冲量与薄浏览器适配
    escape.ts             纯位置出缸销毁判定（无 Babylon 依赖）
    tiers.ts              10 级：id、中文名、半径、质量、图标
    scoring.ts            10*n*n、连击 1.25、首杀 T-800 +3000 + 时间奖励、双 T-800 +5000
    spawn.ts              下一颗队列，仅 1-4 级，权重 35/30/20/15
    physics.ts            Havok 隐形盒墙；罐子是关卡贴图
    merge.ts              同级接触 → 下一级上弹；两颗 T-800 消失
    hammer.ts             3 把锤子：瞄准 → 点已落地的球 → 碎裂 VFX
    failLine.ts           堆住靠近变红 + 警报；越线约 2s 失败
    TokenLayer.ts         2D 圆片层：图标铺满 + 分阶色圈，叠在院子图上
  ui/                     HTML/CSS 覆盖层：分数、计时、下一颗、锤子、toast、胜负
  audio/Sfx.ts            Web Audio 程序音：碰撞、合成、碎裂、警报、胜利
  assets/icons/           01-doubao.webp … 10-t800.webp
  assets/tokens/          01.webp … 10.webp（游戏圆片）
  assets/levels/          01-courtyard.webp（院子+画上的玻璃缸）
  assets/ui/              title.webp（立体字+图标圆片）、hammer.webp（玩具锤，×3 不烤进图）
```

玩法细则只放在 `docs/BRIEF.md`，避免和代码各说各话。

## 资源表

| 游戏内 | 文件 | 来源 |
|---|---|---|
| 1 豆包 | `src/assets/icons/01-doubao.webp` | 豆包官网 apple-touch |
| 2 元宝 | `src/assets/icons/02-yuanbao.webp` | 腾讯元宝标（LobeHub SVG 转 512） |
| 3 Qwen | `src/assets/icons/03-qwen.webp` | 通义官方 lockup 裁切 |
| 4 Kimi | `src/assets/icons/04-kimi.webp` | Moonshot 官方 Branding Guide 圆形图标 |
| 5 DeepSeek | `src/assets/icons/05-deepseek.webp` | Wikimedia DeepSeek-icon.svg |
| 6 Gemini | `src/assets/icons/06-gemini.webp` | Wikimedia Google Gemini icon 2025 |
| 7 Grok | `src/assets/icons/07-grok.webp` | xAI 官方 brand-kit logomark |
| 8 ChatGPT | `src/assets/icons/08-chatgpt.webp` | Wikimedia ChatGPT-Logo.svg |
| 9 Claude | `src/assets/icons/09-claude.webp` | Wikimedia Claude AI symbol |
| 10 T-800 | `src/assets/icons/10-t800.webp` | 端头像（ICON HEAD），不是博物馆老照片 |
| 出处全文 | `docs/ASSET_SOURCES.md` | 从 merge-assets/SOURCES.md 拷来 |

T-800 的 `10-t800.webp` 由 merge-assets 的端头像 PNG 转换而来。不要用 Tekniska museet 那张旧静物照。

演示 / 编辑用途。商标仍归各权利人。

## 移动端

- index.html：viewport-fit=cover，禁止用户缩放。
- canvas：touch-action none，overscroll-behavior none。
- HUD 按 390px 宽排：顶栏分数 / 时间 / 下一颗，底栏一把玩具锤 ×3。
- 锤子按钮足够大，方便拇指。
- 覆盖层用大号按钮和对比度足够的字。

## 视觉

日光院子，不是夜间霓虹。白 / 米色圆角条、气泡立体字、软阴影。禁止厚黑描边和深色硬框。罐子是淡 U 玻璃缸（木底座、没有盖）。球是 2D 圆片：图标铺满，外圈分阶色；预览球半透明。标题「训练大模型」（立体字 + 图标圆片，无树叶）。

截图：`docs/shots/play.jpg`、`docs/shots/title.jpg`。

## 现状

倾斜已改为真实重力向量 `(24·sinθ, -24·cosθ, 0)`。优先使用运动事件的屏幕平面重力，支持四种屏幕方向及旧版 `window.orientation`；通用 Accelerometer 和姿态事件作为回退。近平放保持目标角，3° 死区、0.1 秒平滑；无传感器时倾角为零。保留 iOS 手势申请权限及 300ms 超时、Android 构造时监听。

删除每帧横向叠加力，改为角度变化超过 1.5° 或持续倾斜每 0.5 秒施加极小向下冲量唤醒。球/墙摩擦均从 0.4 降为 0.2，弹性及阻尼不变。倾角达到 15° 时失败等待从 2 秒延长为 4 秒；回到小倾角后按原阈值判断已有计时。`TiltSensor.freeze(sec)` 冻结目标更新；失败检测支持 `paused`（暂停增长和失败触发，仍可警告）。所有倾斜参数见 `src/game/constants.ts` 的 `TILT`。

摇晃检测：`ShakeDetector` 无 DOM 依赖，优先使用 `acceleration`；缺失或无效时使用含重力数据的一阶高通（0.1 秒）。500ms 内峰数门槛从 3 降为 2，仍须超过 17m/s² 且 x/y 主轴至少反转 2 次（所以实际仍至少需要三个交替波瓣）；持续超阈值的同向波瓣不重复计峰，换轴不当作反转。窗口最大加速度在 17–35m/s² 间映射为 0–1 强度，冷却保持 2 秒。通过 `TiltSensor.subscribeMotion` 复用运动监听与 iOS 手势权限；首峰和触发时冻结倾斜目标 0.8 秒。

摇晃效果：仅 `playing` / `hammerAim` 触发，作用于已投放、有刚体、非合成中、非手持球。一次只选一个全缸共用方向，优先检测器完成触发波瓣的 `dominantSign`，缺省时随机 ±1；基础向上 Δv 为 `10 × (0.75 + 0.25 × intensity)`，横向为带共同符号的竖向 0.45 倍。每球仅做长度 ±15%、角度 ±8° 扰动，向量长度上限 14，再乘球质量调用 `applyImpulse`；旋转倍率仍为 1.2。120ms 后施加纯横向、方向相反、大小为该球首脉冲横向分量 0.6 倍的第二脉冲。延迟由 `Game.tick` 驱动，重开、离开游戏阶段及场景释放时清空，已删除或正在合成的球不会再受力。

**摇晃/倾斜偏弱的真正根因（2026-10-27 无头 Chrome 实测）**：
1. `keepInLane` 旧实现对 |z| 越过 ±0.18 的球调用 `setTargetTransform`，Havok 会把整条线速度改成“一步到目标”，挤在薄层边缘的球（满缸时几乎全部）每帧丢掉 x/y 速度：摇晃后 40ms 内这些球 vy≈0，只有 z 在层内的个别球飞起。现改为只修正 z 速度（`Z_SNAP_PER_SEC=60`），保留 x/y 速度；修复后同一满缸场景各球 vy 为 5–15 m/s。
2. Havok 会让静止球堆睡眠；同一帧把睡眠球切为常醒再施冲量，冲量会丢失。现在游戏进行中缸内球一直 `ALWAYS_ACTIVE`，离开游戏阶段交还 `SIMULATION_CONTROLLED`。竖直静置 3 秒最大位移约 0.06 世界单位，摩擦 0.2 下没有明显蠕动。
3. 球被抛到侧墙顶上停住（中心越过内壁、高于墙顶、速度 < `ESCAPE.perchSpeed` 0.6）持续 `ESCAPE.perchSec` 0.5 秒，也按出缸销毁，避免停在墙顶误判负（实测出现过）。
4. 摇晃会让同级球大量相碰而连锁合成（实测一次摇晃最多 18→8 颗），v1 只靠 2 秒冷却限制，后续可加次数上限。

**临时盖子方案已放弃**：已删除 `createLid`、盖子存续/投球锁定逻辑和 `lidSec`；彻底删除按缸口剩余空间限幅的 `headroom` / `safeDy` / `topMargin` 逻辑。允许飞出缸口甚至屏幕顶，飞高本身不销毁。默认向上 Δv=14（桌面 S 键强度 0.8 时约 13.3）在竖直重力 24 下理想上升约 3.7 世界单位，满缸时顶层球可能飞出缸口。

出缸判定为 `escape.ts` 的纯函数，`Game.tick` 每帧在延迟冲量、合成和失败检测之前检查非 held、非 merging 且有 body 的球：

- 默认 `SHAKE.destroyEscaped=true`：中心 `|x| > TANK.innerWidth/2 + TANK.wall` 且中心 `y < TANK.innerHeight + TANK.wall/2` 时销毁；或中心 `y < -2` 时销毁。墙外但仍在墙顶以上暂时保留，允许落回。
- 开关为 false 时，上述普通出缸/掉出地板规则均关闭；安全兜底始终有效：`|x| > 50`、`y > 200` 或 `y < -50` 才销毁。屏幕顶部不是销毁边界。
- 墙体已按 `physics.ts` 的 `boxWall` 核对：侧墙高 `h+t`、中心 `h/2`，顶面 `h+t/2 ≈ 14.596`；侧墙外沿 `w/2+t ≈ 4.742`。地板宽 `w+2t`，只到侧墙外沿，外侧没有额外碰撞体，球越过后可能擦边再掉下；前后墙位于 z 方向，`keepInLane` 将球中心约束在 ±0.18。
- 销毁复用锤子 `tokens.burst` 和 `sfx.shatter`，把最后位置的副本钳到 VIEW 可视范围再绘制碎裂，实际刚体位置不变；随后 `removeBall`。销毁不计分、不耗锤、不触发合成或失败。飞高后回缸的球仍正常合成、计分。
- `removeBall` 移除 ID/刚体映射及排队合成引用，清空指向该球的 pending 及等待时钟；`flushMerges` 再防御已删除或 merging 的球，grows/fades 跳过已删除球，grows 也跳过已开始合成的球，延迟脉冲有同样存活检查。

失败保护：摇晃后暂停从 2.5 秒改为 3 秒，并与倾斜等待倍数合并。`failCheck.tickFail` 对有效且过投放宽限的球，在 `|vy| > FAIL_AIRBORNE_VY=1.0` 时保持原 failClock（不增长、不清零、也不判负，包括穿过警戒线时）；`vy` 缺省视为 0，速度恢复后才继续计时或按线下位置清零。无效球及投放宽限期仍清零。每次触发显示「晃起来啦！」，复用碰撞音并尝试震动 `[30,40,30]`ms；`Hud.toast` 连续调用会清除旧定时器并重新显示 900ms。桌面 **KeyS** 模拟强度 0.8，长按不连发，与手机共用冷却。**v1 防刷分只靠冷却**，不限制摇晃次数、不修改合成得分；重开清空检测样本但保留冷却。

常量对照（旧值以本轮前已提交版本为准）：

| 常量 | 旧 → 新 |
|---|---|
| `SHAKE.impulse` | 6 → 14 |
| `SHAKE.maxDeltaV` | 9 → 18 |
| `SHAKE.minStrength` | 0.5 → 0.75 |
| `SHAKE.lateralRatio` | 0.7（每球随机正负）→ 0.45（全缸共用方向） |
| `SHAKE.minPeaks` | 3 → 2 |
| `SHAKE.failPauseSec` | 2.5 → 3 |
| `PHYS.ballFriction` / `PHYS.wallFriction` | 0.4 → 0.2 |
| `SHAKE.thresholdMs2` / `minReversals` / `cooldownSec` | 保持 17 / 2 / 2 |
| `SHAKE.jitter` / `angleJitterDeg` | 新增 0.15 / 8° |
| `SHAKE.sloshEnabled` / `sloshDelayMs` / `sloshRatio` | 新增 true / 120ms / 0.6 |
| `SHAKE.destroyEscaped` | 新增 true |
| `FAIL_AIRBORNE_VY` | 新增 1.0 |
| `ESCAPE.belowFloorMargin` | 新增 2 |
| `ESCAPE.safetyAbsX` / `safetyMaxY` / `safetyMinY` | 新增 50 / 200 / -50 |
| `SHAKE.randomMin` / `randomMax` / `topMargin` | 删除旧 0.6 / 1.2 / 0.15 |
| 半成品 `SHAKE.lidSec` | 删除 1.6（未提交的临时盖子方案） |

2026-10-27 收尾验证：`npx tsc --noEmit`、`npm test`、`npm run build` 全部通过；用 `--test-isolation=none` 展开为 **60 个用例**全部通过。覆盖 minPeaks=2（仍需两次反转）、dominantSign、共用方向和扰动边界、二段晃向量、出缸严格边界/开关/安全兜底、空中计时与恢复。旧用例「vy=-5 持续下落仍判负」与最终需求冲突，已改为「保持时钟、不判负」。构建仅有产物体积提示。

额外使用 NullEngine + 实际 Havok 和 Game.tick 验证（HUD/音效替身）：首脉冲实测约 `(4.505, 10.012)`，二段晃后约 `(1.802, 10.012)`；顶层球中心升至 15.570，超过墙顶 14.596 后回缸保留；屏幕顶外回落仍可合成得分；缸外落球碎裂且不计分、不判负；pending/mergeQueue/grows/fades/延迟脉冲中的失效引用、开关关闭、安全兜底及重开/离开阶段清理均通过。另直接检查 `Hud.toast` 实际方法，重复调用延长显示、消失后再次调用重新显示均通过。

**画面与视频验证未完成**：当前沙箱拒绝 Vite 监听端口（`listen EPERM`），Chrome 启动也因 socket `Operation not permitted` 退出，因此无法确认实际画面或录制/回看 15–20 秒视频；上述刚体检查不能替代视觉验收。

待真机确认：iOS Safari 历史运动事件按重力方向（乘 +1）、Android/标准 Accelerometer 按支撑加速度（乘 -1）处理；两平台需验证左右倾方向、横竖屏切换、iOS 授权/拒绝、Android 高通回退、17m/s² 阈值及不同采样率的误触/漏触、两秒冷却与震动兼容；确认共用方向二段晃的手感、高堆叠/大倾角下飞出回落和缸外碎裂、3 秒及空中失败保护。本次沿用已有视觉和音频资源，资源表不变。

0.4.0：23 张被引用的 PNG 已以质量 85 转为同名 WebP，像素尺寸及透明通道保持不变，避免影响物理盒与画面对齐；Havok wasm 由 Vite 统一产出一份带 hash 的资源。

院子和罐子是 `01-courtyard.webp` 的 HTML 图，物理墙隐形。圆片画在 2D overlay 上，滚动时图标跟着转。碰撞音是玻璃珠互撞，停稳的堆不再连响。

## 自动部署

### Cloudflare Workers 静态资源配置

已添加 `wrangler.jsonc`（含逐行中文说明），使用 Wrangler 4.152.0 将 `dist/` 作为静态资源目录，目标域名为 `merge-models.tyler4400.com`。当前完成的是配置准备，本次没有登录、上传或绑定域名。后续实际发布和域名访问验证仍待执行。

本地检查顺序：`npm ci` → `npm run build` → `npx wrangler deploy --dry-run` → `npm test`。dry-run 只做部署预演，不发布。`npm run deploy` 会实际发布，且不会自动构建；准备好 Cloudflare 账户及域名权限后，应先运行 `npm run build` 再使用它。

| 部署资源 | 作用与缓存 |
|---|---|
| `wrangler.jsonc` | 固定兼容日期 `2026-10-01`，声明静态资源目录与自定义域名；其它字段为未启用的学习示例 |
| `public/_headers` → `dist/_headers` | Cloudflare 读取的响应头规则；保持手机传感器策略与 Vite 开发环境一致 |
| `dist/assets/*` | 当前构建文件均带内容 hash，浏览器缓存一年并启用 immutable；以后不要混入无 hash 素材 |
| `dist/assets/HavokPhysics-<hash>.wasm` | Vite 根据包内 URL 产出唯一一份 wasm，沿用 `/assets/*` 的一年 immutable 缓存 |

### 现有容器部署

推 `master`、打任意 tag，或在 Actions 页点 `workflow_dispatch`，会构建镜像并推到 `ghcr.io/tyler4400/merge-models`（`:sha` 与 `:latest`），再 SSH 到 CVM 执行 `docker compose pull` 和 `up`。SSH 只负责让机器去拉镜像，不上传文件。顶上的徽章跟 `master` 这次 workflow 的状态。

仓库 Secrets：`HOST`（CVM 公网 IP）、`SSH_USER`、`RSA_PRIVATE_KEY`。把 CVM 上对应用户的 SSH **私钥**全文放进 `RSA_PRIVATE_KEY`，对应公钥写在该用户 `~/.ssh/authorized_keys`。

CVM 需已装 Docker 和 Compose。安全组放行 22 和 **18447**（不要开 80）。打开 `http://HOST:18447`。
