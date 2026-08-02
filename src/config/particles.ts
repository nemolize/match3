import { STANDARD_GRAVITY_ACCELERATION } from "@/constants/physics";

// Anchors the render scale to a directly observable one-cell fall time.
export const FRAGMENT_FREE_FALL_CELL_DURATION_MS = 320;

const MILLISECONDS_PER_SECOND = 1000;
const fragmentFreeFallCellDurationSeconds =
  FRAGMENT_FREE_FALL_CELL_DURATION_MS / MILLISECONDS_PER_SECOND;
const fragmentWorldMetersPerCell =
  (STANDARD_GRAVITY_ACCELERATION * fragmentFreeFallCellDurationSeconds ** 2) /
  2;

export const GPU_PARTICLE_CONFIG = {
  instancesPerGem: 32,
  maximumActiveInstances: 768,
  launchSpeedMultiplier: 2,
  minimumFragmentSizeRatio: 1 / 4,
  maximumFragmentSizeRatio: 1 / 2,
  worldMetersPerCell: fragmentWorldMetersPerCell,
} as const;
