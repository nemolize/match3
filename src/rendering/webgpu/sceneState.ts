import { GPU_PARTICLE_CONFIG } from "@/config/particles";
import { TIMING_CONFIG } from "@/config/timing";
import { WAVE_SIMULATION_CONFIG } from "@/config/waves";
import { GEM_CELL_PADDING_PX } from "@/constants/game";
import { STANDARD_GRAVITY_ACCELERATION } from "@/constants/physics";
import type { Gem, GemType, Position } from "@/types/game";
import {
  createParticles,
  PARTICLE_INITIAL_SPEED_LIMIT,
} from "@/utils/particleLogic";

import {
  FRAGMENT_INSTANCE_LAYOUT,
  FRAGMENT_INSTANCE_STRIDE,
  GEM_INSTANCE_LAYOUT,
  GEM_INSTANCE_STRIDE,
} from "./instanceLayout";
import type { BoardLayout, BoardSceneUpdate } from "./types";

export {
  FRAGMENT_INSTANCE_LAYOUT,
  FRAGMENT_INSTANCE_STRIDE,
  GEM_INSTANCE_LAYOUT,
  GEM_INSTANCE_STRIDE,
} from "./instanceLayout";

export const advanceWaterTime = (
  currentTime: number,
  previousFrameTime: number | null,
  now: number,
  maximumDelta: number,
): number =>
  previousFrameTime === null
    ? currentTime
    : currentTime +
      Math.min(Math.max(0, now - previousFrameTime), maximumDelta);

const GEM_TYPE_GPU_INDEX: Record<GemType, number> = {
  red: 0,
  blue: 1,
  green: 2,
  yellow: 3,
  purple: 4,
  orange: 5,
};

const gemTypeIndex = (type: GemType): number => GEM_TYPE_GPU_INDEX[type];
const positionKey = ({ row, col }: Position): string => `${row}:${col}`;

export interface PackedGemScene {
  data: Float32Array<ArrayBuffer>;
  positions: Map<string, Position>;
}

export const packGemScene = (
  scene: BoardSceneUpdate,
  previousPositions: ReadonlyMap<string, Position>,
  now: number,
): PackedGemScene => {
  const gems = scene.board.flatMap((row, rowIndex) =>
    row.flatMap((gem, colIndex) =>
      gem ? [{ gem, row: rowIndex, col: colIndex }] : [],
    ),
  );
  const data = new Float32Array(gems.length * GEM_INSTANCE_STRIDE);
  const positions = new Map<string, Position>();

  gems.forEach(({ gem, row, col }, index) => {
    const target = { row, col };
    const previous = previousPositions.get(gem.id);
    const fallDistance = gem.fallDistance ?? 0;
    const isDrop = scene.animationPhase === "drop" && fallDistance > 0;
    const isSwap =
      !isDrop &&
      previous !== undefined &&
      (previous.row !== row || previous.col !== col);
    const from =
      previous ??
      (isDrop && gem.entersFromAbove === true
        ? { row: row - fallDistance, col }
        : target);
    const duration = scene.reducedMotion
      ? 0
      : isDrop
        ? TIMING_CONFIG.dropDuration * Math.sqrt(fallDistance)
        : isSwap
          ? TIMING_CONFIG.swapDuration
          : 0;
    const offset = index * GEM_INSTANCE_STRIDE;
    data[offset + GEM_INSTANCE_LAYOUT.fromCol] = from.col;
    data[offset + GEM_INSTANCE_LAYOUT.fromRow] = from.row;
    data[offset + GEM_INSTANCE_LAYOUT.toCol] = col;
    data[offset + GEM_INSTANCE_LAYOUT.toRow] = row;
    data[offset + GEM_INSTANCE_LAYOUT.startedAt] = now;
    data[offset + GEM_INSTANCE_LAYOUT.duration] = duration;
    data[offset + GEM_INSTANCE_LAYOUT.gemType] = gemTypeIndex(gem.type);
    data[offset + GEM_INSTANCE_LAYOUT.selected] =
      scene.selectedGem?.row === row && scene.selectedGem.col === col ? 1 : 0;
    data[offset + GEM_INSTANCE_LAYOUT.animationMode] = isDrop
      ? 1
      : isSwap
        ? 2
        : 0;
    positions.set(gem.id, target);
  });

  return { data, positions };
};

export interface FragmentBurst {
  gem: Gem;
  key: string;
  position: Position;
}

export const WAVE_IMPULSE_STRIDE = 4;

const cellCenterUv = (
  position: Position,
  layout: BoardLayout,
): readonly [number, number] => {
  const step = layout.cellSize + layout.gap;
  return [
    (layout.boardX + position.col * step + layout.cellSize * 0.5) /
      layout.canvasWidth,
    (layout.boardY + position.row * step + layout.cellSize * 0.5) /
      layout.canvasHeight,
  ];
};

export const packWaveImpulses = (
  bursts: readonly FragmentBurst[],
  layout: BoardLayout,
): Float32Array<ArrayBuffer> => {
  const retainedBursts = bursts.slice(-WAVE_SIMULATION_CONFIG.maximumImpulses);
  const values = new Float32Array(retainedBursts.length * WAVE_IMPULSE_STRIDE);
  const radius =
    (layout.cellSize * 0.34) /
    Math.max(layout.canvasWidth, layout.canvasHeight);

  retainedBursts.forEach(({ position }, index) => {
    const offset = index * WAVE_IMPULSE_STRIDE;
    const [centerX, centerY] = cellCenterUv(position, layout);
    values[offset] = centerX;
    values[offset + 1] = centerY;
    values[offset + 2] = WAVE_SIMULATION_CONFIG.impulseAmplitude;
    values[offset + 3] = radius;
  });

  return values;
};

const particleCountPerBurst = (burstCount: number): number =>
  Math.min(
    GPU_PARTICLE_CONFIG.instancesPerGem,
    Math.floor(GPU_PARTICLE_CONFIG.maximumActiveInstances / burstCount),
  );

export const collectNewFragmentBursts = (
  scene: BoardSceneUpdate,
  previousMatchKey: string,
): { bursts: FragmentBurst[]; matchKey: string } => {
  const positions = [
    ...new Map(
      scene.matches
        .flatMap((match) => match.positions)
        .map((position) => [positionKey(position), position]),
    ).values(),
  ];
  if (positions.length === 0) return { bursts: [], matchKey: "" };

  const bursts = positions.flatMap((position) => {
    const gem = scene.board[position.row]?.[position.col];
    return gem ? [{ gem, key: gem.id, position }] : [];
  });
  const matchKey = bursts
    .map(({ key }) => key)
    .sort()
    .join("|");
  return {
    bursts: matchKey === previousMatchKey ? [] : bursts,
    matchKey,
  };
};

export const packFragmentBursts = (
  bursts: readonly FragmentBurst[],
  layout: BoardLayout,
  spawnedAt: number,
  random: (() => number) | undefined,
): Float32Array<ArrayBuffer> => {
  if (bursts.length === 0) return new Float32Array();
  const particlesPerBurst = particleCountPerBurst(bursts.length);
  const values = new Float32Array(
    bursts.length * particlesPerBurst * FRAGMENT_INSTANCE_STRIDE,
  );
  const normalizer = layout.boardSize;
  const step = layout.cellSize + layout.gap;
  const cellStepInBoardUnits = step / normalizer;
  const lifetime = TIMING_CONFIG.particleLifetime;
  const burstEnergyHeightInCellSteps = layout.cellSize / step;
  const burstEnergyHeightInMeters =
    burstEnergyHeightInCellSteps * GPU_PARTICLE_CONFIG.worldMetersPerCell;
  const maximumLaunchSpeedInMetersPerSecond = Math.sqrt(
    2 * STANDARD_GRAVITY_ACCELERATION * burstEnergyHeightInMeters,
  );
  const maximumLaunchSpeedInCellStepsPerSecond =
    maximumLaunchSpeedInMetersPerSecond /
    GPU_PARTICLE_CONFIG.worldMetersPerCell;
  const launchSpeedScale =
    (maximumLaunchSpeedInCellStepsPerSecond *
      GPU_PARTICLE_CONFIG.launchSpeedMultiplier) /
    PARTICLE_INITIAL_SPEED_LIMIT;
  const gravityInBoardUnitsPerSecondSquared =
    (STANDARD_GRAVITY_ACCELERATION / GPU_PARTICLE_CONFIG.worldMetersPerCell) *
    cellStepInBoardUnits;
  let descriptorOffset = 0;
  bursts.forEach(({ gem, position }) => {
    const x = layout.boardX + position.col * step;
    const y = layout.boardY + position.row * step;
    const particles = createParticles({
      x,
      y,
      size: layout.cellSize - GEM_CELL_PADDING_PX * 2,
      count: particlesPerBurst,
      random,
    });
    particles.forEach((particle) => {
      const velocityXInCellStepsPerSecond = particle.vx * launchSpeedScale;
      const velocityYInCellStepsPerSecond = particle.vy * launchSpeedScale;
      values[descriptorOffset + FRAGMENT_INSTANCE_LAYOUT.centerX] =
        (particle.x - layout.boardX) / normalizer;
      values[descriptorOffset + FRAGMENT_INSTANCE_LAYOUT.centerY] =
        (particle.y - layout.boardY) / normalizer;
      values[descriptorOffset + FRAGMENT_INSTANCE_LAYOUT.size] =
        particle.size / normalizer;
      values[descriptorOffset + FRAGMENT_INSTANCE_LAYOUT.velocityX] =
        velocityXInCellStepsPerSecond * cellStepInBoardUnits;
      values[descriptorOffset + FRAGMENT_INSTANCE_LAYOUT.velocityY] =
        velocityYInCellStepsPerSecond * cellStepInBoardUnits;
      values[descriptorOffset + FRAGMENT_INSTANCE_LAYOUT.spawnedAt] = spawnedAt;
      values[descriptorOffset + FRAGMENT_INSTANCE_LAYOUT.gemType] =
        gemTypeIndex(gem.type);
      values[descriptorOffset + FRAGMENT_INSTANCE_LAYOUT.lifetime] = lifetime;
      values[descriptorOffset + FRAGMENT_INSTANCE_LAYOUT.gravity] =
        gravityInBoardUnitsPerSecondSquared;
      values[descriptorOffset + FRAGMENT_INSTANCE_LAYOUT.mass] = particle.mass;
      descriptorOffset += FRAGMENT_INSTANCE_STRIDE;
    });
  });
  return values;
};

const descriptorOffsets = (data: Float32Array<ArrayBuffer>): number[] =>
  Array.from(
    { length: data.length / FRAGMENT_INSTANCE_STRIDE },
    (_, index) => index * FRAGMENT_INSTANCE_STRIDE,
  );

const retainNewestOffsets = (
  offsets: readonly number[],
  maximumCount: number,
): readonly number[] => (maximumCount <= 0 ? [] : offsets.slice(-maximumCount));

const appendDescriptors = (
  target: number[],
  data: Float32Array<ArrayBuffer>,
  offsets: readonly number[],
): void => {
  offsets.forEach((offset) => {
    for (let index = 0; index < FRAGMENT_INSTANCE_STRIDE; index += 1) {
      target.push(data[offset + index] ?? 0);
    }
  });
};

export const mergeActiveFragments = (
  active: Float32Array<ArrayBuffer>,
  additions: Float32Array<ArrayBuffer>,
  now: number,
): Float32Array<ArrayBuffer> => {
  const activeOffsets: number[] = [];
  for (
    let offset = 0;
    offset < active.length;
    offset += FRAGMENT_INSTANCE_STRIDE
  ) {
    const spawnedAt = active[offset + FRAGMENT_INSTANCE_LAYOUT.spawnedAt] ?? 0;
    const lifetime = active[offset + FRAGMENT_INSTANCE_LAYOUT.lifetime] ?? 0;
    if (now - spawnedAt < lifetime) {
      activeOffsets.push(offset);
    }
  }

  const maximumCount = GPU_PARTICLE_CONFIG.maximumActiveInstances;
  const retainedAdditionOffsets = retainNewestOffsets(
    descriptorOffsets(additions),
    maximumCount,
  );
  const retainedActiveOffsets = retainNewestOffsets(
    activeOffsets,
    maximumCount - retainedAdditionOffsets.length,
  );
  const merged: number[] = [];
  appendDescriptors(merged, active, retainedActiveOffsets);
  appendDescriptors(merged, additions, retainedAdditionOffsets);
  return new Float32Array(merged);
};

export const fragmentCount = (data: Float32Array<ArrayBuffer>): number =>
  data.length / FRAGMENT_INSTANCE_STRIDE;

export const fragmentBurstExpiries = (
  data: Float32Array<ArrayBuffer>,
): number[] => {
  const expiries = new Map<string, number>();
  for (
    let offset = 0;
    offset < data.length;
    offset += FRAGMENT_INSTANCE_STRIDE
  ) {
    const centerX = data[offset + FRAGMENT_INSTANCE_LAYOUT.centerX] ?? 0;
    const centerY = data[offset + FRAGMENT_INSTANCE_LAYOUT.centerY] ?? 0;
    const spawnedAt = data[offset + FRAGMENT_INSTANCE_LAYOUT.spawnedAt] ?? 0;
    const gemType = data[offset + FRAGMENT_INSTANCE_LAYOUT.gemType] ?? 0;
    const lifetime = data[offset + FRAGMENT_INSTANCE_LAYOUT.lifetime] ?? 0;
    const burstKey = `${centerX}:${centerY}:${spawnedAt}:${gemType}`;
    expiries.set(
      burstKey,
      Math.max(
        expiries.get(burstKey) ?? Number.NEGATIVE_INFINITY,
        spawnedAt + lifetime,
      ),
    );
  }
  return [...expiries.values()];
};

export const burstKeyForPosition = (position: Position): string =>
  positionKey(position);
