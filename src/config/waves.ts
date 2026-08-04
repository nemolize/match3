import { BOARD_SIZE } from "@/constants/game";

export const WAVE_SIMULATION_CONFIG = {
  impulseAmplitude: 0.075,
  maximumImpulses: BOARD_SIZE * BOARD_SIZE,
  maximumSubstepDeltaFrames: 1.5,
  resolution: 128,
  workgroupSize: 8,
} as const;
