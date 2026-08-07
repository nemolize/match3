import { BOARD_SIZE } from "@/constants/game";

export const WAVE_SIMULATION_CONFIG = {
  edgeDampingMinimum: 0.97,
  gridCoupling: 0.28,
  impulseAmplitude: 0.075,
  maximumImpulses: BOARD_SIZE * BOARD_SIZE,
  maximumSubstepDeltaFrames: 1,
  resolution: 64,
  velocityDampingPerFrame: 0.996,
  workgroupSize: 8,
} as const;
