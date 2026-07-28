import { describe, expect, test } from "vitest";

import { fragmentInstanceStruct, gemInstanceStruct } from "./instanceLayout";
import {
  advanceWaterTime,
  collectNewFragmentBursts,
  FRAGMENT_INSTANCE_LAYOUT,
  FRAGMENT_INSTANCE_STRIDE,
  fragmentCount,
  GEM_INSTANCE_LAYOUT,
  GEM_INSTANCE_STRIDE,
  packFragmentBursts,
  packGemScene,
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

  test("packs deterministic fragment descriptors from an injected random source", () => {
    const randomValues = [0, 0.25, 0.5, 0.75, 0.1, 0.2, 0.3, 0.4];
    let index = 0;
    const random = () => randomValues[index++ % randomValues.length];
    const descriptor = packFragmentBursts(
      [
        {
          gem: gem("a", "purple", 0, 0),
          key: "a",
          position: { row: 1, col: 2 },
        },
      ],
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
      random,
    );

    expect(fragmentCount(descriptor)).toBe(8);
    expect(Array.from(descriptor.slice(0, 10))).toEqual([
      0.310546875, 0.1842447966337204, 0.0326741524040699,
      0.0052083334885537624, -0.0052083334885537624, 90, 0, 500, 4, 1000,
    ]);
    expect(descriptor[10]).toBeCloseTo(0.5 / 384);
  });
});
