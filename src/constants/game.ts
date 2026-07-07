import type { GemType } from "@/types/game";

export const BOARD_SIZE = 8;
export const MIN_MATCH_LENGTH = 3;
// Drag distance (px) at which a swipe fires. Swipes trigger mid-drag, so
// this is the full input latency budget — smaller = snappier, but too small
// misfires on sloppy taps.
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
  red: "bg-red-500",
  blue: "bg-blue-500",
  green: "bg-green-500",
  yellow: "bg-yellow-400",
  purple: "bg-purple-500",
  orange: "bg-orange-500",
};

export const GEM_STYLES: Record<GemType, string> = {
  red: "shadow-red-300",
  blue: "shadow-blue-300",
  green: "shadow-green-300",
  yellow: "shadow-yellow-300",
  purple: "shadow-purple-300",
  orange: "shadow-orange-300",
};
