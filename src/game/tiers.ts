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
  /** Saturated canvas outline; neighbors must not look alike. */
  ring: string;
};

export const TIERS: readonly Tier[] = [
  { id: 1, name: "豆包", radius: 0.54, mass: 0.55, iconUrl: icon01, tint: [1, 0.42, 0.08], ring: "#FF8A12" },
  { id: 2, name: "元宝", radius: 0.68, mass: 0.85, iconUrl: icon02, tint: [1, 0.7, 0.1], ring: "#FFD21A" },
  { id: 3, name: "Qwen", radius: 0.84, mass: 1.3, iconUrl: icon03, tint: [0.42, 0.18, 1], ring: "#A44BFF" },
  { id: 4, name: "Kimi", radius: 1.03, mass: 1.95, iconUrl: icon04, tint: [0.05, 0.78, 0.98], ring: "#00E4F0" },
  { id: 5, name: "DeepSeek", radius: 1.24, mass: 2.9, iconUrl: icon05, tint: [0.12, 0.42, 1], ring: "#1A48F5" },
  { id: 6, name: "Gemini", radius: 1.46, mass: 4.2, iconUrl: icon06, tint: [0.2, 0.55, 1], ring: "#4DB4FF" },
  { id: 7, name: "Grok", radius: 1.69, mass: 6.1, iconUrl: icon07, tint: [0.55, 0.58, 0.7], ring: "#C2CCD8" },
  { id: 8, name: "ChatGPT", radius: 1.98, mass: 8.6, iconUrl: icon08, tint: [0.08, 0.78, 0.55], ring: "#10C9A6" },
  { id: 9, name: "Claude", radius: 2.21, mass: 12, iconUrl: icon09, tint: [1, 0.38, 0.12], ring: "#FF6B5C" },
  { id: 10, name: "T-800", radius: 2.48, mass: 18, iconUrl: icon10, tint: [0.85, 0.18, 0.12], ring: "#E21818" },
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
