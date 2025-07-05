// Animation and timing configuration for the match-3 game
export const TIMING_CONFIG = {
  // Gem animations
  swapDuration: 300, // ms - Time for gems to swap positions
  dropDuration: 250, // ms - Time for gems to drop to new positions
  matchClearDuration: 200, // ms - Time for matched gems to disappear

  // Game flow delays
  matchClearDelay: 250, // ms - Pause after clearing matches to let players see results
  dropAnimationWait: 500, // ms - Base wait time for drop animations to complete
  cascadeDelay: 50, // ms - Delay between cascade cycles when no animations

  // Easing
  swapEasing: "easeOut" as const,
  dropEasing: "linear" as const,
  matchEasing: "easeInOut" as const,
} as const;
