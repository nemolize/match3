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

  test("should find 4x3 trapezoid (top-wide, left-aligned)", () => {
    const board = createEmptyBoard();
    // Create: xxxx
    //         xxx
    board[1][1] = createGem("purple", 1, 1);
    board[1][2] = createGem("purple", 1, 2);
    board[1][3] = createGem("purple", 1, 3);
    board[1][4] = createGem("purple", 1, 4);
    board[2][1] = createGem("purple", 2, 1);
    board[2][2] = createGem("purple", 2, 2);
    board[2][3] = createGem("purple", 2, 3);

    const matches = findTrapezoidMatches(board);

    expect(matches.length).toBeGreaterThan(0);
    const trapezoid = matches.find((m) => m.positions.length === 7);
    expect(trapezoid).toBeDefined();
    expect(trapezoid.type).toBe("purple");
    expect(trapezoid.score).toBe(1225); // 7 * 175
  });

  test("should find 4x2 trapezoid (top-wide, center-aligned)", () => {
    const board = createEmptyBoard();
    // Create: xxxx
    //          xx
    board[5][0] = createGem("orange", 5, 0);
    board[5][1] = createGem("orange", 5, 1);
    board[5][2] = createGem("orange", 5, 2);
    board[5][3] = createGem("orange", 5, 3);
    board[6][1] = createGem("orange", 6, 1);
    board[6][2] = createGem("orange", 6, 2);

    const matches = findTrapezoidMatches(board);

    expect(matches.length).toBeGreaterThan(0);
    const trapezoid = matches.find((m) => m.positions.length === 6);
    expect(trapezoid).toBeDefined();
    expect(trapezoid.type).toBe("orange");
    expect(trapezoid.score).toBe(1050); // 6 * 175
  });

  test("should find 4x2 trapezoid (bottom-wide, right-aligned)", () => {
    const board = createEmptyBoard();
    // Create:   xx
    //         xxxx
    board[2][4] = createGem("red", 2, 4);
    board[2][5] = createGem("red", 2, 5);
    board[3][2] = createGem("red", 3, 2);
    board[3][3] = createGem("red", 3, 3);
    board[3][4] = createGem("red", 3, 4);
    board[3][5] = createGem("red", 3, 5);

    const matches = findTrapezoidMatches(board);

    expect(matches.length).toBeGreaterThan(0);
    const trapezoid = matches.find((m) => m.positions.length === 6);
    expect(trapezoid).toBeDefined();
    expect(trapezoid.type).toBe("red");
    expect(trapezoid.score).toBe(1050); // 6 * 175
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
});
