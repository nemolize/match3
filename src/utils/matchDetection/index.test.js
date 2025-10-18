import { describe, expect, test } from "vitest";

import { findMatches } from "./index";
import { createEmptyBoard, createGem } from "./testHelpers";

describe("Match Detection Integration", () => {
  test("should find both horizontal and vertical matches", () => {
    const board = createEmptyBoard();
    // Create an L-shape that has both horizontal and vertical matches
    // Horizontal: (2,1), (2,2), (2,3)
    board[2][1] = createGem("red", 2, 1);
    board[2][2] = createGem("red", 2, 2);
    board[2][3] = createGem("red", 2, 3);
    // Vertical: (2,1), (3,1), (4,1)
    board[3][1] = createGem("red", 3, 1);
    board[4][1] = createGem("red", 4, 1);

    const matches = findMatches(board);

    // Should only get one match (the longer one due to deduplication)
    expect(matches).toHaveLength(1);
  });

  test("should find separate horizontal and vertical matches with no overlap", () => {
    const board = createEmptyBoard();
    // Horizontal match
    board[0][0] = createGem("red", 0, 0);
    board[0][1] = createGem("red", 0, 1);
    board[0][2] = createGem("red", 0, 2);
    // Vertical match (no overlap)
    board[4][4] = createGem("blue", 4, 4);
    board[5][4] = createGem("blue", 5, 4);
    board[6][4] = createGem("blue", 6, 4);

    const matches = findMatches(board);

    expect(matches).toHaveLength(2);
  });

  test("should return empty array for board with no matches", () => {
    const board = createEmptyBoard();
    // Create a checkerboard pattern with no matches
    board[0][0] = createGem("red", 0, 0);
    board[0][1] = createGem("blue", 0, 1);
    board[0][2] = createGem("red", 0, 2);
    board[1][0] = createGem("blue", 1, 0);
    board[1][1] = createGem("red", 1, 1);
    board[1][2] = createGem("blue", 1, 2);

    const matches = findMatches(board);

    expect(matches).toHaveLength(0);
  });

  test("should handle completely empty board", () => {
    const board = createEmptyBoard();
    const matches = findMatches(board);

    expect(matches).toHaveLength(0);
  });

  test("should find rectangular matches in addition to linear matches", () => {
    const board = createEmptyBoard();
    // Create a 2x2 rectangular match
    board[0][0] = createGem("red", 0, 0);
    board[0][1] = createGem("red", 0, 1);
    board[1][0] = createGem("red", 1, 0);
    board[1][1] = createGem("red", 1, 1);
    // Create a separate horizontal match
    board[5][0] = createGem("blue", 5, 0);
    board[5][1] = createGem("blue", 5, 1);
    board[5][2] = createGem("blue", 5, 2);

    const matches = findMatches(board);

    // Should find both the rectangular and horizontal matches
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  test("should prioritize rectangular matches over linear matches when overlapping", () => {
    const board = createEmptyBoard();
    // Create a 2x3 rectangle which also contains horizontal matches
    board[2][2] = createGem("purple", 2, 2);
    board[2][3] = createGem("purple", 2, 3);
    board[2][4] = createGem("purple", 2, 4);
    board[3][2] = createGem("purple", 3, 2);
    board[3][3] = createGem("purple", 3, 3);
    board[3][4] = createGem("purple", 3, 4);

    const matches = findMatches(board);

    // Should prioritize the rectangular match (score 900) over linear matches
    expect(matches.length).toBeGreaterThan(0);
    const rectangularMatch = matches.find((m) => m.score === 900);
    expect(rectangularMatch).toBeDefined();
  });

  test("should prioritize L-shape over rectangular and linear matches", () => {
    const board = createEmptyBoard();
    // Create L-shape that also contains lines and potential rectangles
    // Corner at (4, 2), vertical extends up only, horizontal extends right only
    board[4][2] = createGem("red", 4, 2); // Corner
    board[3][2] = createGem("red", 3, 2); // Up
    board[2][2] = createGem("red", 2, 2); // Up
    board[4][3] = createGem("red", 4, 3); // Right
    board[4][4] = createGem("red", 4, 4); // Right

    const matches = findMatches(board);

    // Should find L-shape (score 1000) as highest priority
    expect(matches.length).toBeGreaterThan(0);
    const lShape = matches.find((m) => m.score === 1000);
    expect(lShape).toBeDefined();
    expect(lShape.positions.length).toBe(5);
  });

  test("should prioritize +-shape over L-shape and all other matches", () => {
    const board = createEmptyBoard();
    // Create +-shape
    board[3][3] = createGem("blue", 3, 3); // Center
    board[2][3] = createGem("blue", 2, 3); // Up
    board[4][3] = createGem("blue", 4, 3); // Down
    board[3][2] = createGem("blue", 3, 2); // Left
    board[3][4] = createGem("blue", 3, 4); // Right

    const matches = findMatches(board);

    // Should find +-shape (score 1250) as highest priority
    expect(matches.length).toBeGreaterThan(0);
    const plusShape = matches.find((m) => m.score === 1250);
    expect(plusShape).toBeDefined();
    expect(plusShape.positions.length).toBe(5);
  });

  test("should handle board with multiple shape types and prioritize correctly", () => {
    const board = createEmptyBoard();
    // +-shape (highest priority)
    board[1][1] = createGem("red", 1, 1);
    board[1][2] = createGem("red", 1, 2);
    board[1][3] = createGem("red", 1, 3);
    board[0][2] = createGem("red", 0, 2);
    board[2][2] = createGem("red", 2, 2);

    // L-shape (second priority)
    // Corner at (6, 5), vertical extends up only, horizontal extends right only
    board[6][5] = createGem("blue", 6, 5);
    board[5][5] = createGem("blue", 5, 5);
    board[4][5] = createGem("blue", 4, 5);
    board[6][6] = createGem("blue", 6, 6);
    board[6][7] = createGem("blue", 6, 7);

    // Simple horizontal line (lowest priority)
    board[7][0] = createGem("green", 7, 0);
    board[7][1] = createGem("green", 7, 1);
    board[7][2] = createGem("green", 7, 2);

    const matches = findMatches(board);

    expect(matches.length).toBe(3);
    // Verify all three shapes are found
    const plusShape = matches.find((m) => m.type === "red");
    const lShape = matches.find((m) => m.type === "blue");
    const lineMatch = matches.find((m) => m.type === "green");

    expect(plusShape).toBeDefined();
    expect(lShape).toBeDefined();
    expect(lineMatch).toBeDefined();

    // Verify scores are correct
    expect(plusShape?.score).toBe(1250); // 5 * 250
    expect(lShape?.score).toBe(1000); // 5 * 200
    expect(lineMatch?.score).toBe(300); // 3 * 100
  });

  test("should handle overlapping L-shape and +-shape correctly", () => {
    const board = createEmptyBoard();
    // Create a pattern that forms both L and + shapes
    // This creates a +-shape, but parts could be interpreted as L-shapes
    board[3][3] = createGem("orange", 3, 3);
    board[2][3] = createGem("orange", 2, 3);
    board[4][3] = createGem("orange", 4, 3);
    board[5][3] = createGem("orange", 5, 3); // Extended vertical
    board[3][2] = createGem("orange", 3, 2);
    board[3][4] = createGem("orange", 3, 4);
    board[3][5] = createGem("orange", 3, 5); // Extended horizontal

    const matches = findMatches(board);

    // Should prioritize +-shape over any L-shapes
    expect(matches.length).toBeGreaterThan(0);
    // The highest scoring match should be the +-shape
    const topMatch = matches.reduce((max, match) =>
      match.score > max.score ? match : max,
    );
    expect(topMatch.score).toBeGreaterThanOrEqual(1500); // At least 6 gems * 250
  });
});
