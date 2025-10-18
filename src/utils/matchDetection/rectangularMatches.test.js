import { describe, expect, test } from "vitest";

import { findRectangularMatches } from "./rectangularMatches";
import { createEmptyBoard, createGem } from "./testHelpers";

describe("Rectangular Matches", () => {
  test("should find 2x2 rectangular match", () => {
    const board = createEmptyBoard();
    // Create a 2x2 square of red gems
    board[0][0] = createGem("red", 0, 0);
    board[0][1] = createGem("red", 0, 1);
    board[1][0] = createGem("red", 1, 0);
    board[1][1] = createGem("red", 1, 1);

    const matches = findRectangularMatches(board);

    expect(matches).toHaveLength(1);
    expect(matches[0].type).toBe("red");
    expect(matches[0].positions).toHaveLength(4);
    expect(matches[0].score).toBe(600); // 4 * 150
  });

  test("should find 2x3 rectangular match", () => {
    const board = createEmptyBoard();
    // Create a 2x3 rectangle of blue gems
    board[2][2] = createGem("blue", 2, 2);
    board[2][3] = createGem("blue", 2, 3);
    board[2][4] = createGem("blue", 2, 4);
    board[3][2] = createGem("blue", 3, 2);
    board[3][3] = createGem("blue", 3, 3);
    board[3][4] = createGem("blue", 3, 4);

    const matches = findRectangularMatches(board);

    // May find multiple matches (2x3 and contained 2x2s)
    expect(matches.length).toBeGreaterThan(0);
    // Should include the 2x3 match
    const twoByThree = matches.find((m) => m.positions.length === 6);
    expect(twoByThree).toBeDefined();
    expect(twoByThree.type).toBe("blue");
    expect(twoByThree.score).toBe(900); // 6 * 150
  });

  test("should find 3x2 rectangular match", () => {
    const board = createEmptyBoard();
    // Create a 3x2 rectangle of green gems
    board[4][1] = createGem("green", 4, 1);
    board[4][2] = createGem("green", 4, 2);
    board[5][1] = createGem("green", 5, 1);
    board[5][2] = createGem("green", 5, 2);
    board[6][1] = createGem("green", 6, 1);
    board[6][2] = createGem("green", 6, 2);

    const matches = findRectangularMatches(board);

    // May find multiple matches (3x2 and contained 2x2s)
    expect(matches.length).toBeGreaterThan(0);
    // Should include the 3x2 match
    const threeByTwo = matches.find((m) => m.positions.length === 6);
    expect(threeByTwo).toBeDefined();
    expect(threeByTwo.type).toBe("green");
    expect(threeByTwo.score).toBe(900); // 6 * 150
  });

  test("should not find rectangular match with different colors", () => {
    const board = createEmptyBoard();
    // Create a 2x2 with mixed colors
    board[0][0] = createGem("red", 0, 0);
    board[0][1] = createGem("blue", 0, 1);
    board[1][0] = createGem("red", 1, 0);
    board[1][1] = createGem("red", 1, 1);

    const matches = findRectangularMatches(board);

    expect(matches).toHaveLength(0);
  });

  test("should find multiple rectangular matches", () => {
    const board = createEmptyBoard();
    // First 2x2
    board[0][0] = createGem("red", 0, 0);
    board[0][1] = createGem("red", 0, 1);
    board[1][0] = createGem("red", 1, 0);
    board[1][1] = createGem("red", 1, 1);
    // Second 2x2 (separate)
    board[4][4] = createGem("blue", 4, 4);
    board[4][5] = createGem("blue", 4, 5);
    board[5][4] = createGem("blue", 5, 4);
    board[5][5] = createGem("blue", 5, 5);

    const matches = findRectangularMatches(board);

    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  test("should handle incomplete rectangles", () => {
    const board = createEmptyBoard();
    // Almost a 2x2, but missing one corner
    board[0][0] = createGem("red", 0, 0);
    board[0][1] = createGem("red", 0, 1);
    board[1][0] = createGem("red", 1, 0);
    // board[1][1] is null

    const matches = findRectangularMatches(board);

    // Should not find a 2x2 match
    const twoByTwo = matches.filter((m) => m.positions.length === 4);
    expect(twoByTwo).toHaveLength(0);
  });

  test("should handle board edges correctly", () => {
    const board = createEmptyBoard();
    // Try to create a 2x2 at the bottom-right corner
    board[6][6] = createGem("yellow", 6, 6);
    board[6][7] = createGem("yellow", 6, 7);
    board[7][6] = createGem("yellow", 7, 6);
    board[7][7] = createGem("yellow", 7, 7);

    const matches = findRectangularMatches(board);

    expect(matches).toHaveLength(1);
    expect(matches[0].type).toBe("yellow");
  });
});
