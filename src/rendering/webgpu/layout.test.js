import { describe, expect, test } from "vitest";

import { createBoardLayout } from "./layout";

describe("WebGPU board layout", () => {
  test("derives the cell size while preserving layout-space geometry", () => {
    expect(
      createBoardLayout({
        boardSize: 384,
        boardX: 16,
        boardY: 16,
        canvasHeight: 416,
        canvasWidth: 416,
        devicePixelRatio: 2,
        gap: 4,
      }),
    ).toEqual({
      boardSize: 384,
      boardX: 16,
      boardY: 16,
      canvasHeight: 416,
      canvasWidth: 416,
      cellSize: 44.5,
      devicePixelRatio: 2,
      gap: 4,
    });
  });
});
