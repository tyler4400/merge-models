# 合成大模型 demo assets — sources


> **T-800 更正：** 游戏使用的 `10-t800.png` 是端头像（ICON HEAD，与 `10-t800-icon.png` 相同），不是下表里那张 Tekniska museet 博物馆静物照。

All files under `/workspace/merge-assets/` are for a playable demo only.
Prefer official / first-party / Wikimedia Commons / brand-guide originals.
SVGs converted to 512px PNG with `rsvg-convert`. Official bitmaps resized with ImageMagick Lanczos.
Circle-mask / black-background punch applied only to sit marks on a glass sphere (no redesign).

| File | Pixels | Type | Source URL | What it is |
|---|---|---|---|---|
| `01-doubao.png` | 512×512 (from official 180×180) | icon-mark (mascot / app icon) | https://lf-flow-web-cdn.doubao.com/obj/flow-doubao/favicon/new-doubao/180x180.png | Official Doubao (豆包) apple-touch / site avatar from ByteDance CDN. Circular character portrait; corners made transparent. Official site did not expose a larger PNG. |
| `02-yuanbao.png` | 512×512 | icon-mark | https://unpkg.com/@lobehub/icons-static-svg/icons/yuanbao-color.svg | Official Tencent Yuanbao (元宝) green-circle + white ingot mark **via LobeHub icon pack**. Official site `https://yuanbao.tencent.com/` only ships a 40×40 favicon and 160×160 `logo_with_bg.png` (https://static.yuanbao.tencent.com/m/yuanbao-web/logo_with_bg.png) — same mark, too small for a sphere, so the LobeHub SVG was rendered at 512. |
| `03-qwen.png` | 512×512 | icon-mark (cropped from official wordmark lockup) | https://qianwen-res.oss-accelerate-overseas.aliyuncs.com/logo_qwen3.png | Official Qwen3 lockup (3944×1555 wordmark + mark on black). Icon-mark cropped from the left, black bg punched, padded square. Companion Wikimedia icon: https://commons.wikimedia.org/wiki/File:Qwen_logo.svg |
| `04-kimi.png` | 512×512 (from official 1024×1024) | icon-mark (official app / round icon) | https://moonshotai.github.io/Branding-Guide/scenarios/03-icon-without-kimi/kimi-icon-round.png | Official Moonshot **KIMI Icon — Round** from the first-party Branding Guide. White K + blue droplet on lunar texture. Also available: K-only color SVG at `…/scenarios/04-k-only/k-only-color.svg`. Wordmark fallback: https://raw.githubusercontent.com/MoonshotAI/Kimi-K3/main/assets/kimi-logo.png |
| `05-deepseek.png` | 512×512 | icon-mark (whale) | https://commons.wikimedia.org/wiki/Special:FilePath/DeepSeek-icon.svg | Wikimedia File:DeepSeek-icon.svg — DeepSeek whale icon extracted from chat.deepseek.com. **Not** the horizontal wordmark (`File:DeepSeek_logo.svg`). |
| `06-gemini.png` | 512×512 | icon-mark (2025 sparkle) | https://commons.wikimedia.org/wiki/Special:FilePath/Google_Gemini_icon_2025.svg | Wikimedia File:Google_Gemini_icon_2025.svg — official 2025 Google Gemini four-point rainbow star, extracted from About Gemini. |
| `07-grok.png` | 512×512 (from official 1024×1024) | icon-mark (2025 Saturn-G) | https://data.x.ai/logos/xAI_Grok_Assets.zip (`Grok_Logomark_Light.png` / `.svg`) | Official xAI / Grok brand-kit logomark from `https://x.ai/legal/brand-guidelines` download zip. Black bg punched so the white G sits on glass. Wordmarks also in that zip; not used. |
| `08-chatgpt.png` | 512×512 | icon-mark (blossom) | https://commons.wikimedia.org/wiki/Special:FilePath/ChatGPT-Logo.svg | Wikimedia File:ChatGPT-Logo.svg — official ChatGPT blossom path, rendered in ChatGPT green `#10A37F`. Current 2025 OpenAI/ChatGPT monochrome blossom is File:OpenAI_logo_2025_(symbol).svg (black, poor contrast on dark glass). openai.com/favicon.ico also fetched (48/32 ico). |
| `09-claude.png` | 512×512 | icon-mark (starburst) | https://commons.wikimedia.org/wiki/Special:FilePath/Claude_AI_symbol.svg | Wikimedia File:Claude_AI_symbol.svg — Claude starburst from anthropic.com. Official `https://claude.ai/apple-touch-icon.png` (180×180, white burst on terracotta square) also downloaded as confirmation. |
| `10-t800.png` | 512×512 (cropped from 1266×1715) | photo still (movie T-800 endoskeleton) | https://commons.wikimedia.org/wiki/File:Tekniska_museet_-_BugWarp_(57)_(cropped).jpg | Wikimedia Commons: T-800 endoskeleton prop at Tekniska museet (chrome skull, red eyes, hydraulics). Lightly cropped to a square head-and-shoulders. Alternate (more cluttered): File:Terminator Skull Head Bust from Terminator Salvation, Earls Court, London (Ank Kumar, Infosys Limited).jpg. Schwarzenegger T-800 wax figure also fetched: File:T-800 in Disneyland Paris.jpg (not used). |

## Official URLs that were tried

- Doubao site / CDN: `https://www.doubao.com/` apple-touch 180 (used). No 512 official PNG found.
- Yuanbao site: `https://yuanbao.tencent.com/` favicon 40px + `logo_with_bg.png` 160px (same mark; too small).
- Qwen official wordmark PNG (used, then cropped to mark).
- Kimi Branding Guide `https://moonshotai.github.io/Branding-Guide/` (used round icon).
- DeepSeek Wikimedia icon (used). Wordmark skipped.
- Gemini Wikimedia 2025 icon (used).
- xAI official zip `https://data.x.ai/logos/xAI_Grok_Assets.zip` (used).
- ChatGPT / OpenAI Wikimedia blossom (used). chatgpt.com/apple-touch-icon returned HTML, not an image.
- Claude Wikimedia symbol (used).
- T-800: Commons Category:Terminator (character).

## Missing / caveats

- **No brand missing.** All 10 slots filled.
- Doubao official max was 180px (upscaled). LobeHub also has a different Doubao abstract loop mark (`doubao-color`) at 640 — not used, because first-party site uses the character avatar.
- Yuanbao official max was 160px; 512 file is the same official mark via LobeHub.
- T-800 is a museum photo of a movie-accurate chrome endoskeleton, not a studio still. Autographed Salvation bust was rejected as too cluttered.
- Demo / editorial use only. Marks remain trademarked by their owners.
