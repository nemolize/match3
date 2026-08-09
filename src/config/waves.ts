import { BOARD_SIZE } from "@/constants/game";

// `PerFrame` / `DeltaFrames` values are in 60fps reference frames (1/60 s), not
// display frames — the renderer converts elapsed milliseconds into these units.
export const WAVE_SIMULATION_CONFIG = {
  edgeDampingMinimum: 0.97,
  gridCoupling: 0.28,
  heightRestoringForcePerFrame: 0.0008,
  impulseAmplitude: 0.075,
  maximumImpulses: BOARD_SIZE * BOARD_SIZE,
  maximumSubstepDeltaFrames: 0.5,
  resolution: 64,
  velocityDampingPerFrame: 0.98,
  workgroupSize: 8,
} as const;
