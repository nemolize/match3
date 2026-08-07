import { BOARD_SIZE } from "@/constants/game";

export const WAVE_SIMULATION_CONFIG = {
  edgeDampingMinimum: 0.97,
  impulseAmplitude: 0.075,
  maximumImpulses: BOARD_SIZE * BOARD_SIZE,
  maximumSubstepDeltaFrames: 1.5,
  propagationSpeed: 0.28,
  resolution: 128,
  velocityDampingPerFrame: 0.996,
  workgroupSize: 8,
} as const;
