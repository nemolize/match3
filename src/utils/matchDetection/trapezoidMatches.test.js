import { describe, expect, test } from "vitest";

import { createEmptyBoard, createGem } from "./testHelpers";
import { findTrapezoidMatches } from "./trapezoidMatches";

describe("Trapezoid Matches", () => {
  test("should find 3x2 trapezoid (top-wide, left-aligned)", () => {
    const board = createEmptyBoard();
    // Create: xxx
    //         xx
    board[0][0] = createGem("red", 0, 0);
    board[0][1] = createGem("red", 0, 1);
    board[0][2] = createGem("red", 0, 2);
    board[1][0] = createGem("red", 1, 0);
    board[1][1] = createGem("red", 1, 1);

    const matches = findTrapezoidMatches(board);

    expect(matches.length).toBeGreaterThan(0);
    const trapezoid = matches.find((m) => m.positions.length === 5);
    expect(trapezoid).toBeDefined();
    expect(trapezoid.type).toBe("red");
    expect(trapezoid.score).toBe(875); // 5 * 175
  });

  test("should find 3x2 trapezoid (top-wide, center-aligned)", () => {
    const board = createEmptyBoard();
    // Create: xxx
    //          xx
    board[2][1] = createGem("blue", 2, 1);
    board[2][2] = createGem("blue", 2, 2);
    board[2][3] = createGem("blue", 2, 3);
    board[3][2] = createGem("blue", 3, 2);
    board[3][3] = createGem("blue", 3, 3);

    const matches = findTrapezoidMatches(board);

    expect(matches.length).toBeGreaterThan(0);
    const trapezoid = matches.find((m) => m.positions.length === 5);
    expect(trapezoid).toBeDefined();
    expect(trapezoid.type).toBe("blue");
    expect(trapezoid.score).toBe(875); // 5 * 175
  });

  test("should find 3x2 trapezoid (bottom-wide, left-aligned)", () => {
    const board = createEmptyBoard();
    // Create: xx
    //         xxx
    board[0][0] = createGem("green", 0, 0);
    board[0][1] = createGem("green", 0, 1);
    board[1][0] = createGem("green", 1, 0);
    board[1][1] = createGem("green", 1, 1);
    board[1][2] = createGem("green", 1, 2);

    const matches = findTrapezoidMatches(board);

    expect(matches.length).toBeGreaterThan(0);
    const trapezoid = matches.find((m) => m.positions.length === 5);
    expect(trapezoid).toBeDefined();
    expect(trapezoid.type).toBe("green");
    expect(trapezoid.score).toBe(875); // 5 * 175
  });

  test("should find 3x2 trapezoid (bottom-wide, center-aligned)", () => {
    const board = createEmptyBoard();
    // Create:  xx
    //         xxx
    board[3][1] = createGem("yellow", 3, 1);
    board[3][2] = createGem("yellow", 3, 2);
    board[4][0] = createGem("yellow", 4, 0);
    board[4][1] = createGem("yellow", 4, 1);
    board[4][2] = createGem("yellow", 4, 2);

    const matches = findTrapezoidMatches(board);

    expect(matches.length).toBeGreaterThan(0);
    const trapezoid = matches.find((m) => m.positions.length === 5);
    expect(trapezoid).toBeDefined();
    expect(trapezoid.type).toBe("yellow");
    expect(trapezoid.score).toBe(875); // 5 * 175
  });

  test("should not find trapezoid with mismatched colors", () => {
    const board = createEmptyBoard();
    // Create mismatched pattern
    board[0][0] = createGem("red", 0, 0);
    board[0][1] = createGem("blue", 0, 1); // Different color
    board[0][2] = createGem("red", 0, 2);
    board[1][0] = createGem("red", 1, 0);
    board[1][1] = createGem("red", 1, 1);

    const matches = findTrapezoidMatches(board);

    expect(matches).toHaveLength(0);
  });

  test("should not find trapezoid with incomplete pattern", () => {
    const board = createEmptyBoard();
    // Create incomplete pattern (missing one gem)
    board[0][0] = createGem("green", 0, 0);
    board[0][1] = createGem("green", 0, 1);
    board[0][2] = createGem("green", 0, 2);
    board[1][0] = createGem("green", 1, 0);
    // board[1][1] is missing

    const matches = findTrapezoidMatches(board);

    expect(matches).toHaveLength(0);
  });

  test("should handle multiple trapezoids on the board", () => {
    const board = createEmptyBoard();

    // First trapezoid at top-left
    board[0][0] = createGem("red", 0, 0);
    board[0][1] = createGem("red", 0, 1);
    board[0][2] = createGem("red", 0, 2);
    board[1][0] = createGem("red", 1, 0);
    board[1][1] = createGem("red", 1, 1);

    // Second trapezoid at bottom-right
    board[6][5] = createGem("blue", 6, 5);
    board[6][6] = createGem("blue", 6, 6);
    board[7][5] = createGem("blue", 7, 5);
    board[7][6] = createGem("blue", 7, 6);
    board[7][7] = createGem("blue", 7, 7);

    const matches = findTrapezoidMatches(board);

    expect(matches.length).toBeGreaterThanOrEqual(2);
    const redTrapezoid = matches.find((m) => m.type === "red");
    const blueTrapezoid = matches.find((m) => m.type === "blue");
    expect(redTrapezoid).toBeDefined();
    expect(blueTrapezoid).toBeDefined();
  });

  test("should not find trapezoid at board edge (out of bounds)", () => {
    const board = createEmptyBoard();
    // Try to create trapezoid that would extend beyond board
    board[7][6] = createGem("purple", 7, 6);
    board[7][7] = createGem("purple", 7, 7);
    // Would need gems at row 8, which doesn't exist

    const matches = findTrapezoidMatches(board);

    expect(matches).toHaveLength(0);
  });

  test("should find vertical trapezoid pattern (1-2-2, left-aligned)", () => {
    const board = createEmptyBoard();
    // Create:  x
    //          xx
    //          xx
    board[0][0] = createGem("red", 0, 0);
    board[1][0] = createGem("red", 1, 0);
    board[1][1] = createGem("red", 1, 1);
    board[2][0] = createGem("red", 2, 0);
    board[2][1] = createGem("red", 2, 1);

    const matches = findTrapezoidMatches(board);

    expect(matches.length).toBeGreaterThan(0);
    const trapezoid = matches.find((m) => m.positions.length === 5);
    expect(trapezoid).toBeDefined();
    expect(trapezoid.type).toBe("red");
    expect(trapezoid.score).toBe(875); // 5 * 175
  });

  test("should find vertical trapezoid pattern (1-2-2, right-aligned)", () => {
    const board = createEmptyBoard();
    // Create:   x
    //          xx
    //          xx
    board[0][1] = createGem("blue", 0, 1);
    board[1][0] = createGem("blue", 1, 0);
    board[1][1] = createGem("blue", 1, 1);
    board[2][0] = createGem("blue", 2, 0);
    board[2][1] = createGem("blue", 2, 1);

    const matches = findTrapezoidMatches(board);

    expect(matches.length).toBeGreaterThan(0);
    const trapezoid = matches.find((m) => m.positions.length === 5);
    expect(trapezoid).toBeDefined();
    expect(trapezoid.type).toBe("blue");
    expect(trapezoid.score).toBe(875); // 5 * 175
  });
});
