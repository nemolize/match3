import { TIMING_CONFIG } from "@/config/timing";
import { GEM_CELL_PADDING_PX, GEM_TYPES } from "@/constants/game";
import type { Gem, GemType, Position } from "@/types/game";
import { createParticles } from "@/utils/particleLogic";

import type { BoardLayout, BoardSceneUpdate } from "./types";

export const GEM_INSTANCE_STRIDE = 12;
export const FRAGMENT_INSTANCE_STRIDE = 12;

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

const gemTypeIndex = (type: GemType): number => GEM_TYPES.indexOf(type);
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
    data.set(
      [
        from.col,
        from.row,
        col,
        row,
        now,
        duration,
        gemTypeIndex(gem.type),
        scene.selectedGem?.row === row && scene.selectedGem.col === col ? 1 : 0,
        isDrop ? 1 : isSwap ? 2 : 0,
        0,
        0,
        0,
      ],
      offset,
    );
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
  const values: number[] = [];
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
      values.push(
        (particle.x - layout.boardX) / normalizer,
        (particle.y - layout.boardY) / normalizer,
        particle.size / normalizer,
        particle.vx / normalizer,
        particle.vy / normalizer,
        particle.rotation,
        particle.rotationSpeed,
        spawnedAt,
        gemTypeIndex(gem.type),
        TIMING_CONFIG.particleLifetime,
        0.5 / normalizer,
        0,
      );
    });
  });
  return new Float32Array(values);
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
    const spawnedAt = active[offset + 7] ?? 0;
    const lifetime = active[offset + 9] ?? 0;
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
