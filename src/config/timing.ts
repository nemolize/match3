import { BOARD_SIZE } from "@/constants/game";

const DROP_DURATION = 160;

// Animation and timing configuration for the match-3 game
export const TIMING_CONFIG = {
  // Gem animations
  swapDuration: 300, // ms - Time for gems to swap positions
  dropDuration: DROP_DURATION, // ms - Fall time over one cell; longer falls scale with sqrt(distance)
  matchClearDuration: 200, // ms - Time for matched gems to disappear

  // Particle effects
  particleLifetime: 1000, // ms - Time for particle effects to complete
  particleCount: 8, // Number of particles per broken gem

  // Game flow delays
  matchClearDelay: 250, // ms - Pause after clearing matches to let players see results
  dropAnimationWait: Math.ceil(DROP_DURATION * Math.sqrt(BOARD_SIZE)) + 50,
  cascadeDelay: 50, // ms - Delay between cascade cycles when no animations

  // Easing
  swapEasing: "easeOut" as const,
  matchEasing: "easeInOut" as const,
} as const;
