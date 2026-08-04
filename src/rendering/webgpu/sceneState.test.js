import { describe, expect, test } from "vitest";

import {
  FRAGMENT_FREE_FALL_CELL_DURATION_MS,
  GPU_PARTICLE_CONFIG,
} from "@/config/particles";
import { TIMING_CONFIG } from "@/config/timing";
import { WAVE_SIMULATION_CONFIG } from "@/config/waves";
import { GEM_CELL_PADDING_PX } from "@/constants/game";
import {
  REFERENCE_FRAGMENT_DRAG_RATE_PER_SECOND,
  STANDARD_GRAVITY_ACCELERATION,
} from "@/constants/physics";

import { fragmentInstanceStruct, gemInstanceStruct } from "./instanceLayout";
import {
  advanceWaterTime,
  collectNewFragmentBursts,
  FRAGMENT_INSTANCE_LAYOUT,
  FRAGMENT_INSTANCE_STRIDE,
  fragmentBurstExpiries,
  fragmentCount,
  GEM_INSTANCE_LAYOUT,
  GEM_INSTANCE_STRIDE,
  mergeActiveFragments,
  packFragmentBursts,
  packGemScene,
  packWaveImpulses,
  WAVE_IMPULSE_STRIDE,
} from "./sceneState";

const gem = (id, type, row, col, extra = {}) => ({
  id,
  type,
  position: { row, col },
  ...extra,
});

const emptyBoard = () =>
  Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => null));

const scene = (board, overrides = {}) => ({
  animationPhase: "idle",
  board,
  matches: [],
  reducedMotion: false,
  selectedGem: null,
  ...overrides,
});

describe("WebGPU scene packing", () => {
  test("derives matching CPU and WGSL instance layouts", () => {
    const expectMatchingLayout = (layout, stride, wgsl) => {
      const offsets = Object.values(layout).sort((left, right) => left - right);
      expect(offsets).toEqual(
        Array.from({ length: stride }, (_, index) => index),
      );
      expect(wgsl.match(/: f32,/g)).toHaveLength(stride);
    };

    expectMatchingLayout(
      GEM_INSTANCE_LAYOUT,
      GEM_INSTANCE_STRIDE,
      gemInstanceStruct,
    );
    expectMatchingLayout(
      FRAGMENT_INSTANCE_LAYOUT,
      FRAGMENT_INSTANCE_STRIDE,
      fragmentInstanceStruct,
    );
  });

  test("uses stable GPU indices for every gem type", () => {
    const board = emptyBoard();
    ["red", "blue", "green", "yellow", "purple", "orange"].forEach(
      (type, col) => {
        board[0][col] = gem(type, type, 0, col);
      },
    );

    const packed = packGemScene(scene(board), new Map(), 0);
    const gemTypeIndices = Array.from({ length: 6 }, (_, index) => {
      const offset = index * GEM_INSTANCE_STRIDE;
      return packed.data[offset + GEM_INSTANCE_LAYOUT.gemType];
    });

    expect(gemTypeIndices).toEqual([0, 1, 2, 3, 4, 5]);
  });

  test("clamps water time after a long frame stall", () => {
    expect(advanceWaterTime(120, 1000, 5000, 50)).toBe(170);
    expect(advanceWaterTime(120, null, 5000, 50)).toBe(120);
  });

  test("preserves gem identity across a swap", () => {
    const board = emptyBoard();
    board[0][1] = gem("ruby", "red", 0, 1);
    const packed = packGemScene(
      scene(board, { animationPhase: "swap" }),
      new Map([["ruby", { row: 0, col: 0 }]]),
      100,
    );

    expect(Array.from(packed.data.slice(0, 9))).toEqual([
      0, 0, 1, 0, 100, 300, 0, 0, 2,
    ]);
  });

  test("uses the gravity duration and entry row for refill gems", () => {
    const board = emptyBoard();
    board[3][2] = gem("new", "blue", 3, 2, {
      entersFromAbove: true,
      fallDistance: 4,
    });
    const packed = packGemScene(
      scene(board, { animationPhase: "drop" }),
      new Map(),
      250,
    );

    expect(Array.from(packed.data.slice(0, 9))).toEqual([
      2, -1, 2, 3, 250, 320, 1, 0, 1,
    ]);
  });

  test("animates an existing gem back when an invalid swap is reverted", () => {
    const board = emptyBoard();
    board[0][0] = gem("ruby", "red", 0, 0);
    const packed = packGemScene(
      scene(board),
      new Map([["ruby", { row: 0, col: 1 }]]),
      400,
    );

    expect(Array.from(packed.data.slice(0, 9))).toEqual([
      1, 0, 0, 0, 400, 300, 0, 0, 2,
    ]);
  });

  test("deduplicates the same match and keeps new gem identities distinct", () => {
    const board = emptyBoard();
    board[0][0] = gem("a", "green", 0, 0);
    const first = collectNewFragmentBursts(
      scene(board, {
        matches: [
          { positions: [{ row: 0, col: 0 }], score: 10, type: "green" },
        ],
      }),
      "",
    );
    const duplicate = collectNewFragmentBursts(
      scene(board, {
        matches: [
          { positions: [{ row: 0, col: 0 }], score: 10, type: "green" },
        ],
      }),
      first.matchKey,
    );

    expect(first.bursts).toHaveLength(1);
    expect(duplicate.bursts).toHaveLength(0);
  });

  test("emits one burst for a cell shared by crossing matches", () => {
    const board = emptyBoard();
    const positions = [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
      { row: 1, col: 1 },
      { row: 2, col: 1 },
    ];
    positions.forEach((position, index) => {
      board[position.row][position.col] = gem(
        `cross-${index}`,
        "green",
        position.row,
        position.col,
      );
    });

    const collected = collectNewFragmentBursts(
      scene(board, {
        matches: [
          { positions: positions.slice(0, 3), score: 30, type: "green" },
          {
            positions: [positions[1], positions[3], positions[4]],
            score: 30,
            type: "green",
          },
        ],
      }),
      "",
    );

    expect(collected.bursts).toHaveLength(5);
    expect(new Set(collected.bursts.map(({ key }) => key)).size).toBe(5);
  });

  test("packs cleared cell centers as wave impulses", () => {
    const layout = {
      canvasHeight: 416,
      canvasWidth: 416,
      boardSize: 384,
      boardX: 16,
      boardY: 16,
      cellSize: 44.5,
      devicePixelRatio: 1,
      gap: 4,
    };
    const descriptor = packWaveImpulses(
      [
        {
          gem: gem("a", "purple", 1, 2),
          key: "a",
          position: { row: 1, col: 2 },
        },
      ],
      layout,
    );

    expect(descriptor).toHaveLength(WAVE_IMPULSE_STRIDE);
    expect(descriptor[0]).toBeCloseTo(135.25 / 416);
    expect(descriptor[1]).toBeCloseTo(86.75 / 416);
    expect(descriptor[2]).toBeCloseTo(0.075);
    expect(descriptor[3]).toBeCloseTo((44.5 * 0.34) / 416);
  });

  test("caps wave impulses at configured capacity and keeps the newest", () => {
    const bursts = Array.from(
      { length: WAVE_SIMULATION_CONFIG.maximumImpulses + 2 },
      (_, index) => ({
        gem: gem(`gem-${index}`, "blue", index % 8, index % 8),
        key: `gem-${index}`,
        position: { row: index % 8, col: index % 8 },
      }),
    );
    const descriptor = packWaveImpulses(bursts, {
      canvasHeight: 400,
      canvasWidth: 400,
      boardSize: 384,
      boardX: 8,
      boardY: 8,
      cellSize: 44.5,
      devicePixelRatio: 1,
      gap: 4,
    });

    expect(descriptor).toHaveLength(
      WAVE_SIMULATION_CONFIG.maximumImpulses * WAVE_IMPULSE_STRIDE,
    );
    expect(descriptor[0]).toBeCloseTo((8 + 2 * 48.5 + 22.25) / 400);
  });

  test("packs deterministic fragment descriptors from an injected random source", () => {
    let randomCall = 0;
    const random = () => {
      const particleIndex = Math.floor(randomCall / 3);
      const propertyIndex = randomCall % 3;
      randomCall += 1;
      if (propertyIndex === 2) return particleIndex % 2 === 0 ? 0.2 : 0.8;
      return particleIndex % 2 === 0
        ? propertyIndex === 1
          ? 0.9
          : 0.875
        : propertyIndex === 1
          ? 0.6
          : 0.375;
    };
    const layout = {
      canvasHeight: 416,
      canvasWidth: 416,
      boardSize: 384,
      boardX: 16,
      boardY: 16,
      cellSize: 44.5,
      devicePixelRatio: 1,
      gap: 4,
    };
    const descriptor = packFragmentBursts(
      [
        {
          gem: gem("a", "purple", 0, 0),
          key: "a",
          position: { row: 1, col: 2 },
        },
      ],
      layout,
      500,
      random,
    );

    expect(fragmentCount(descriptor)).toBe(GPU_PARTICLE_CONFIG.instancesPerGem);
    expect(descriptor[FRAGMENT_INSTANCE_LAYOUT.centerX]).toBeCloseTo(
      0.310546875,
    );
    expect(descriptor[FRAGMENT_INSTANCE_LAYOUT.centerY]).toBeCloseTo(
      0.1842447966337204,
    );
    expect(descriptor[FRAGMENT_INSTANCE_LAYOUT.size]).toBeCloseTo(
      ((layout.cellSize - GEM_CELL_PADDING_PX * 2) *
        (GPU_PARTICLE_CONFIG.minimumFragmentSizeRatio +
          (GPU_PARTICLE_CONFIG.maximumFragmentSizeRatio -
            GPU_PARTICLE_CONFIG.minimumFragmentSizeRatio) *
            0.2)) /
        layout.boardSize,
    );
    expect(descriptor[FRAGMENT_INSTANCE_LAYOUT.velocityX]).toBeGreaterThan(0);
    expect(descriptor[FRAGMENT_INSTANCE_LAYOUT.velocityY]).toBeLessThan(0);
    expect(descriptor[FRAGMENT_INSTANCE_LAYOUT.spawnedAt]).toBe(500);
    expect(descriptor[FRAGMENT_INSTANCE_LAYOUT.gemType]).toBe(4);
    expect(descriptor[FRAGMENT_INSTANCE_LAYOUT.lifetime]).toBe(
      TIMING_CONFIG.particleLifetime,
    );
    const packedGravity = descriptor[FRAGMENT_INSTANCE_LAYOUT.gravity] ?? 0;
    const freeFallCellDurationSeconds =
      FRAGMENT_FREE_FALL_CELL_DURATION_MS / 1000;
    expect((packedGravity * freeFallCellDurationSeconds ** 2) / 2).toBeCloseTo(
      (layout.cellSize + layout.gap) / layout.boardSize,
    );
    expect(descriptor[FRAGMENT_INSTANCE_LAYOUT.mass]).toBeCloseTo(0.88);
    expect(
      descriptor[FRAGMENT_INSTANCE_STRIDE + FRAGMENT_INSTANCE_LAYOUT.mass],
    ).toBeCloseTo(1.57);
    const initialSpeedMagnitudes = Array.from(
      { length: fragmentCount(descriptor) },
      (_, particleIndex) => {
        const offset = particleIndex * FRAGMENT_INSTANCE_STRIDE;
        return Math.hypot(
          descriptor[offset + FRAGMENT_INSTANCE_LAYOUT.velocityX] ?? 0,
          descriptor[offset + FRAGMENT_INSTANCE_LAYOUT.velocityY] ?? 0,
        );
      },
    );
    expect(Math.max(...initialSpeedMagnitudes)).toBeGreaterThan(
      Math.min(...initialSpeedMagnitudes),
    );
    const cellStepInBoardUnits =
      (layout.cellSize + layout.gap) / layout.boardSize;
    const burstEnergyHeightInCellSteps =
      layout.cellSize / (layout.cellSize + layout.gap);
    const burstEnergyHeightInMeters =
      burstEnergyHeightInCellSteps * GPU_PARTICLE_CONFIG.worldMetersPerCell;
    const maximumLaunchSpeedInMetersPerSecond = Math.sqrt(
      2 * STANDARD_GRAVITY_ACCELERATION * burstEnergyHeightInMeters,
    );
    const maximumLaunchSpeedInCellStepsPerSecond =
      maximumLaunchSpeedInMetersPerSecond /
      GPU_PARTICLE_CONFIG.worldMetersPerCell;
    expect(Math.max(...initialSpeedMagnitudes)).toBeCloseTo(
      maximumLaunchSpeedInCellStepsPerSecond *
        GPU_PARTICLE_CONFIG.launchSpeedMultiplier *
        0.9 *
        cellStepInBoardUnits,
    );
    const expiryVelocities = Array.from(
      { length: fragmentCount(descriptor) },
      (_, particleIndex) => {
        const offset = particleIndex * FRAGMENT_INSTANCE_STRIDE;
        const lifetimeSeconds =
          (descriptor[offset + FRAGMENT_INSTANCE_LAYOUT.lifetime] ?? 0) / 1000;
        const velocityY =
          descriptor[offset + FRAGMENT_INSTANCE_LAYOUT.velocityY] ?? 0;
        const gravity =
          descriptor[offset + FRAGMENT_INSTANCE_LAYOUT.gravity] ?? 0;
        const mass = descriptor[offset + FRAGMENT_INSTANCE_LAYOUT.mass] ?? 1;
        const dragRate = REFERENCE_FRAGMENT_DRAG_RATE_PER_SECOND / mass;
        const expiryDragDecay = Math.exp(-dragRate * lifetimeSeconds);
        return (
          velocityY * expiryDragDecay +
          (gravity * (1 - expiryDragDecay)) / dragRate
        );
      },
    );
    expect(expiryVelocities.every((velocity) => velocity > 0)).toBe(true);
    expect(fragmentBurstExpiries(descriptor)).toEqual([
      500 + TIMING_CONFIG.particleLifetime,
    ]);
  });

  test("caps particle instances for a full-board clear", () => {
    const bursts = Array.from({ length: 64 }, (_, index) => ({
      gem: gem(`gem-${index}`, "blue", Math.floor(index / 8), index % 8),
      key: `gem-${index}`,
      position: { row: Math.floor(index / 8), col: index % 8 },
    }));
    const descriptor = packFragmentBursts(
      bursts,
      {
        canvasHeight: 416,
        canvasWidth: 416,
        boardSize: 384,
        boardX: 16,
        boardY: 16,
        cellSize: 44.5,
        devicePixelRatio: 1,
        gap: 4,
      },
      500,
      () => 0.5,
    );

    expect(fragmentCount(descriptor)).toBe(
      GPU_PARTICLE_CONFIG.maximumActiveInstances,
    );
  });

  test("caps overlapping clears globally and prioritizes new particles", () => {
    const bursts = Array.from({ length: 64 }, (_, index) => ({
      gem: gem(`gem-${index}`, "blue", Math.floor(index / 8), index % 8),
      key: `gem-${index}`,
      position: { row: Math.floor(index / 8), col: index % 8 },
    }));
    const layout = {
      canvasHeight: 416,
      canvasWidth: 416,
      boardSize: 384,
      boardX: 16,
      boardY: 16,
      cellSize: 44.5,
      devicePixelRatio: 1,
      gap: 4,
    };
    const active = packFragmentBursts(bursts, layout, 500, () => 0.5);
    const additions = packFragmentBursts(bursts, layout, 800, () => 0.5);
    const merged = mergeActiveFragments(active, additions, 900);

    expect(fragmentCount(merged)).toBe(
      GPU_PARTICLE_CONFIG.maximumActiveInstances,
    );
    expect(merged[FRAGMENT_INSTANCE_LAYOUT.spawnedAt]).toBe(800);
    expect(fragmentBurstExpiries(merged)).toHaveLength(64);
  });

  test("removes expired fragments while retaining newer bursts", () => {
    const layout = {
      canvasHeight: 416,
      canvasWidth: 416,
      boardSize: 384,
      boardX: 16,
      boardY: 16,
      cellSize: 44.5,
      devicePixelRatio: 1,
      gap: 4,
    };
    const oldBurst = packFragmentBursts(
      [
        {
          gem: gem("old", "blue", 0, 0),
          key: "old",
          position: { row: 0, col: 0 },
        },
      ],
      layout,
      0,
      () => 0.5,
    );
    const newerBurst = packFragmentBursts(
      [
        {
          gem: gem("new", "green", 1, 1),
          key: "new",
          position: { row: 1, col: 1 },
        },
      ],
      layout,
      750,
      () => 0.5,
    );
    const active = mergeActiveFragments(oldBurst, newerBurst, 750);
    const retained = mergeActiveFragments(
      active,
      new Float32Array(),
      TIMING_CONFIG.particleLifetime,
    );

    expect(fragmentCount(retained)).toBe(GPU_PARTICLE_CONFIG.instancesPerGem);
    expect(retained[FRAGMENT_INSTANCE_LAYOUT.spawnedAt]).toBe(750);
    expect(fragmentBurstExpiries(retained)).toEqual([
      750 + TIMING_CONFIG.particleLifetime,
    ]);
  });

  test("keeps the newest dust when overlap reaches the cap", () => {
    const activeBurst = [
      {
        gem: gem("active", "purple", 0, 0),
        key: "active",
        position: { row: 0, col: 0 },
      },
    ];
    const additionBursts = Array.from({ length: 58 }, (_, index) => ({
      gem: gem(`new-${index}`, "green", index % 8, index % 8),
      key: `new-${index}`,
      position: { row: index % 8, col: index % 8 },
    }));
    const layout = {
      canvasHeight: 416,
      canvasWidth: 416,
      boardSize: 384,
      boardX: 16,
      boardY: 16,
      cellSize: 44.5,
      devicePixelRatio: 1,
      gap: 4,
    };
    const active = packFragmentBursts(activeBurst, layout, 500, () => 0.5);
    const additions = packFragmentBursts(
      additionBursts,
      layout,
      800,
      () => 0.5,
    );
    const merged = mergeActiveFragments(active, additions, 900);
    const retainedActiveCount =
      GPU_PARTICLE_CONFIG.maximumActiveInstances - fragmentCount(additions);

    expect(fragmentCount(merged)).toBe(
      GPU_PARTICLE_CONFIG.maximumActiveInstances,
    );
    expect(
      Array.from(
        { length: retainedActiveCount },
        (_, index) =>
          merged[
            index * FRAGMENT_INSTANCE_STRIDE +
              FRAGMENT_INSTANCE_LAYOUT.spawnedAt
          ],
      ).every((spawnedAt) => spawnedAt === 500),
    ).toBe(true);
    expect(
      merged[
        retainedActiveCount * FRAGMENT_INSTANCE_STRIDE +
          FRAGMENT_INSTANCE_LAYOUT.spawnedAt
      ],
    ).toBe(800);
  });
});
