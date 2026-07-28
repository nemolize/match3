import { TIMING_CONFIG } from "@/config/timing";
import { GEM_CELL_PADDING_PX } from "@/constants/game";
import type { Gem, GemType, Position } from "@/types/game";
import { createParticles } from "@/utils/particleLogic";

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

export const collectNewFragmentBursts = (
  scene: BoardSceneUpdate,
  previousMatchKey: string,
): { bursts: FragmentBurst[]; matchKey: string } => {
  const positions = scene.matches.flatMap((match) => match.positions);
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
  const values = new Float32Array(
    bursts.length * TIMING_CONFIG.particleCount * FRAGMENT_INSTANCE_STRIDE,
  );
  let descriptorOffset = 0;
  bursts.forEach(({ gem, position }) => {
    const step = layout.cellSize + layout.gap;
    const x = layout.boardX + position.col * step;
    const y = layout.boardY + position.row * step;
    const particles = createParticles({
      x,
      y,
      size: layout.cellSize - GEM_CELL_PADDING_PX * 2,
      random,
    });
    particles.forEach((particle) => {
      const normalizer = layout.boardSize;
      values[descriptorOffset + FRAGMENT_INSTANCE_LAYOUT.centerX] =
        (particle.x - layout.boardX) / normalizer;
      values[descriptorOffset + FRAGMENT_INSTANCE_LAYOUT.centerY] =
        (particle.y - layout.boardY) / normalizer;
      values[descriptorOffset + FRAGMENT_INSTANCE_LAYOUT.size] =
        particle.size / normalizer;
      values[descriptorOffset + FRAGMENT_INSTANCE_LAYOUT.velocityX] =
        particle.vx / normalizer;
      values[descriptorOffset + FRAGMENT_INSTANCE_LAYOUT.velocityY] =
        particle.vy / normalizer;
      values[descriptorOffset + FRAGMENT_INSTANCE_LAYOUT.rotation] =
        particle.rotation;
      values[descriptorOffset + FRAGMENT_INSTANCE_LAYOUT.rotationSpeed] =
        particle.rotationSpeed;
      values[descriptorOffset + FRAGMENT_INSTANCE_LAYOUT.spawnedAt] = spawnedAt;
      values[descriptorOffset + FRAGMENT_INSTANCE_LAYOUT.gemType] =
        gemTypeIndex(gem.type);
      values[descriptorOffset + FRAGMENT_INSTANCE_LAYOUT.lifetime] =
        TIMING_CONFIG.particleLifetime;
      values[descriptorOffset + FRAGMENT_INSTANCE_LAYOUT.gravity] =
        0.5 / normalizer;
      descriptorOffset += FRAGMENT_INSTANCE_STRIDE;
    });
  });
  return values;
};

export const mergeActiveFragments = (
  active: Float32Array<ArrayBuffer>,
  additions: Float32Array<ArrayBuffer>,
  now: number,
): Float32Array<ArrayBuffer> => {
  const kept: number[] = [];
  for (
    let offset = 0;
    offset < active.length;
    offset += FRAGMENT_INSTANCE_STRIDE
  ) {
    const spawnedAt = active[offset + FRAGMENT_INSTANCE_LAYOUT.spawnedAt] ?? 0;
    const lifetime = active[offset + FRAGMENT_INSTANCE_LAYOUT.lifetime] ?? 0;
    if (now - spawnedAt < lifetime) {
      for (let index = 0; index < FRAGMENT_INSTANCE_STRIDE; index += 1) {
        kept.push(active[offset + index] ?? 0);
      }
    }
  }
  kept.push(...additions);
  return new Float32Array(kept);
};

export const fragmentCount = (data: Float32Array<ArrayBuffer>): number =>
  data.length / FRAGMENT_INSTANCE_STRIDE;

export const burstKeyForPosition = (position: Position): string =>
  positionKey(position);
