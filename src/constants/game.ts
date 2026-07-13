import type { GemType } from "@/types/game";

export const BOARD_SIZE = 8;
export const MIN_MATCH_LENGTH = 3;
// Drag distance (px) at which a swipe fires. Swipes trigger mid-drag, so
// this is the full input latency budget — smaller = snappier, but too small
// misfires on sloppy taps. Tunable: 24 for extra-snappy on touch screens,
// 32 for fewer misfires on high-DPI trackpads.
export const SWIPE_THRESHOLD = 28;

export const GEM_TYPES: GemType[] = [
  "red",
  "blue",
  "green",
  "yellow",
  "purple",
  "orange",
];

export const GEM_COLORS: Record<GemType, string> = {
  red: "bg-rose-500/65",
  blue: "bg-cyan-300/60",
  green: "bg-emerald-400/65",
  yellow: "bg-yellow-300/65",
  purple: "bg-violet-400/65",
  orange: "bg-amber-400/65",
};

export const GEM_STYLES: Record<GemType, string> = {
  red: "shadow-rose-300",
  blue: "shadow-cyan-200",
  green: "shadow-emerald-300",
  yellow: "shadow-yellow-300",
  purple: "shadow-violet-300",
  orange: "shadow-amber-300",
};

export const GEM_NAMES: Record<GemType, string> = {
  red: "ruby",
  blue: "Paraiba tourmaline",
  green: "emerald",
  yellow: "citrine",
  purple: "amethyst",
  orange: "imperial topaz",
};
