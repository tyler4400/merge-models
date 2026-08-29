/** Ten merge tiers. Phase 1 only drops 1–4; the rest exist so later phases can merge. */

import icon01 from "../assets/icons/01-doubao.png";
import icon02 from "../assets/icons/02-yuanbao.png";
import icon03 from "../assets/icons/03-qwen.png";
import icon04 from "../assets/icons/04-kimi.png";
import icon05 from "../assets/icons/05-deepseek.png";
import icon06 from "../assets/icons/06-gemini.png";
import icon07 from "../assets/icons/07-grok.png";
import icon08 from "../assets/icons/08-chatgpt.png";
import icon09 from "../assets/icons/09-claude.png";
import icon10 from "../assets/icons/10-t800.png";

export type TierId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export type Tier = {
  id: TierId;
  name: string;
  radius: number;
  mass: number;
  iconUrl: string;
  /** Warm glass albedo (linear-ish 0–1). */
  tint: [number, number, number];
};

export const TIERS: readonly Tier[] = [
  { id: 1, name: "豆包", radius: 0.4, mass: 0.55, iconUrl: icon01, tint: [0.92, 0.66, 0.28] },
  { id: 2, name: "元宝", radius: 0.5, mass: 0.85, iconUrl: icon02, tint: [0.95, 0.78, 0.28] },
  { id: 3, name: "Qwen", radius: 0.62, mass: 1.3, iconUrl: icon03, tint: [0.55, 0.42, 0.95] },
  { id: 4, name: "Kimi", radius: 0.76, mass: 1.95, iconUrl: icon04, tint: [0.36, 0.78, 0.9] },
  { id: 5, name: "DeepSeek", radius: 0.92, mass: 2.9, iconUrl: icon05, tint: [0.3, 0.55, 0.95] },
  { id: 6, name: "Gemini", radius: 1.1, mass: 4.2, iconUrl: icon06, tint: [0.48, 0.64, 1] },
  { id: 7, name: "Grok", radius: 1.3, mass: 6.1, iconUrl: icon07, tint: [0.82, 0.82, 0.86] },
  { id: 8, name: "ChatGPT", radius: 1.52, mass: 8.6, iconUrl: icon08, tint: [0.35, 0.82, 0.7] },
  { id: 9, name: "Claude", radius: 1.78, mass: 12, iconUrl: icon09, tint: [0.88, 0.48, 0.3] },
  { id: 10, name: "T-800", radius: 2.1, mass: 18, iconUrl: icon10, tint: [0.78, 0.36, 0.3] },
];

/** Player may only drop these. */
export const MAX_DROP_TIER = 4;

export function getTier(id: number): Tier {
  const tier = TIERS[id - 1];
  if (!tier) throw new Error(`unknown tier ${id}`);
  return tier;
}

export function nextTier(id: TierId): TierId | null {
  return id >= 10 ? null : ((id + 1) as TierId);
}

export function tierDef(id: number) {
  return getTier(id);
}
