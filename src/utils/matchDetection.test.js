import { describe, expect, test } from "vitest";
import {
  findHorizontalMatches,
  findMatches,
  findVerticalMatches,
  removeDuplicateMatches,
} from "@/utils/matchDetection";

// Helper function to create a gem
const createGem = (type, row, col) => ({
  id: `${type}-${row}-${col}`,
  type,
  position: { row, col },
});

// Helper function to create an empty 8x8 board
const createEmptyBoard = () => {
  return Array(8)
    .fill(null)
    .map(() => Array(8).fill(null));
};

describe("Match Detection", () => {
  describe("findHorizontalMatches", () => {
    test("should find horizontal match of 3 gems", () => {
      const board = createEmptyBoard();
      board[0][0] = createGem("red", 0, 0);
      board[0][1] = createGem("red", 0, 1);
      board[0][2] = createGem("red", 0, 2);

      const matches = findHorizontalMatches(board);

      expect(matches).toHaveLength(1);
      expect(matches[0].type).toBe("red");
      expect(matches[0].positions).toEqual([
        { row: 0, col: 0 },
        { row: 0, col: 1 },
        { row: 0, col: 2 },
      ]);
      expect(matches[0].score).toBe(300);
    });

    test("should find horizontal match of 4 gems", () => {
      const board = createEmptyBoard();
      board[1][2] = createGem("blue", 1, 2);
      board[1][3] = createGem("blue", 1, 3);
      board[1][4] = createGem("blue", 1, 4);
      board[1][5] = createGem("blue", 1, 5);

      const matches = findHorizontalMatches(board);

      expect(matches).toHaveLength(1);
      expect(matches[0].type).toBe("blue");
      expect(matches[0].positions).toHaveLength(4);
      expect(matches[0].score).toBe(400);
    });

    test("should not find horizontal match of 2 gems", () => {
      const board = createEmptyBoard();
      board[0][0] = createGem("red", 0, 0);
      board[0][1] = createGem("red", 0, 1);

      const matches = findHorizontalMatches(board);

      expect(matches).toHaveLength(0);
    });

    test("should find multiple horizontal matches on different rows", () => {
      const board = createEmptyBoard();
      // First match
      board[0][0] = createGem("red", 0, 0);
      board[0][1] = createGem("red", 0, 1);
      board[0][2] = createGem("red", 0, 2);
      // Second match
      board[2][3] = createGem("blue", 2, 3);
      board[2][4] = createGem("blue", 2, 4);
      board[2][5] = createGem("blue", 2, 5);

      const matches = findHorizontalMatches(board);

      expect(matches).toHaveLength(2);
    });

    test("should handle interrupted matches (gaps)", () => {
      const board = createEmptyBoard();
      board[0][0] = createGem("red", 0, 0);
      board[0][1] = createGem("red", 0, 1);
      board[0][2] = createGem("blue", 0, 2); // Different color interrupts
      board[0][3] = createGem("red", 0, 3);
      board[0][4] = createGem("red", 0, 4);
      board[0][5] = createGem("red", 0, 5);

      const matches = findHorizontalMatches(board);

      expect(matches).toHaveLength(1); // Only the 3-gem red match at end
      expect(matches[0].positions).toEqual([
        { row: 0, col: 3 },
        { row: 0, col: 4 },
        { row: 0, col: 5 },
      ]);
    });

    test("should handle empty spaces in board", () => {
      const board = createEmptyBoard();
      board[0][0] = createGem("red", 0, 0);
      board[0][1] = createGem("red", 0, 1);
      // board[0][2] is null (empty)
      board[0][3] = createGem("red", 0, 3);
      board[0][4] = createGem("red", 0, 4);
      board[0][5] = createGem("red", 0, 5);

      const matches = findHorizontalMatches(board);

      expect(matches).toHaveLength(1); // Only the 3-gem match after the gap
      expect(matches[0].positions).toEqual([
        { row: 0, col: 3 },
        { row: 0, col: 4 },
        { row: 0, col: 5 },
      ]);
    });
  });

  describe("findVerticalMatches", () => {
    test("should find vertical match of 3 gems", () => {
      const board = createEmptyBoard();
      board[0][0] = createGem("green", 0, 0);
      board[1][0] = createGem("green", 1, 0);
      board[2][0] = createGem("green", 2, 0);

      const matches = findVerticalMatches(board);

      expect(matches).toHaveLength(1);
      expect(matches[0].type).toBe("green");
      expect(matches[0].positions).toEqual([
        { row: 0, col: 0 },
        { row: 1, col: 0 },
        { row: 2, col: 0 },
      ]);
      expect(matches[0].score).toBe(300);
    });

    test("should find vertical match of 5 gems", () => {
      const board = createEmptyBoard();
      board[1][3] = createGem("yellow", 1, 3);
      board[2][3] = createGem("yellow", 2, 3);
      board[3][3] = createGem("yellow", 3, 3);
      board[4][3] = createGem("yellow", 4, 3);
      board[5][3] = createGem("yellow", 5, 3);

      const matches = findVerticalMatches(board);

      expect(matches).toHaveLength(1);
      expect(matches[0].positions).toHaveLength(5);
      expect(matches[0].score).toBe(500);
    });

    test("should not find vertical match of 2 gems", () => {
      const board = createEmptyBoard();
      board[0][0] = createGem("purple", 0, 0);
      board[1][0] = createGem("purple", 1, 0);

      const matches = findVerticalMatches(board);

      expect(matches).toHaveLength(0);
    });

    test("should handle interrupted vertical matches", () => {
      const board = createEmptyBoard();
      board[0][0] = createGem("red", 0, 0);
      board[1][0] = createGem("red", 1, 0);
      board[2][0] = createGem("blue", 2, 0); // Different color interrupts
      board[3][0] = createGem("red", 3, 0);
      board[4][0] = createGem("red", 4, 0);
      board[5][0] = createGem("red", 5, 0);

      const matches = findVerticalMatches(board);

      expect(matches).toHaveLength(1); // Only the 3-gem red match at bottom
      expect(matches[0].positions).toEqual([
        { row: 3, col: 0 },
        { row: 4, col: 0 },
        { row: 5, col: 0 },
      ]);
    });
  });

  describe("removeDuplicateMatches", () => {
    test("should prioritize longer matches over shorter ones", () => {
      const matches = [
        {
          positions: [
            { row: 0, col: 0 },
            { row: 0, col: 1 },
            { row: 0, col: 2 },
          ],
          type: "red",
          score: 300,
        },
        {
          positions: [
            { row: 0, col: 0 },
            { row: 1, col: 0 },
            { row: 2, col: 0 },
            { row: 3, col: 0 },
          ],
          type: "red",
          score: 400,
        },
      ];

      const result = removeDuplicateMatches(matches);

      expect(result).toHaveLength(1);
      expect(result[0].score).toBe(400); // Longer match should be kept
      expect(result[0].positions).toHaveLength(4);
    });

    test("should keep non-overlapping matches", () => {
      const matches = [
        {
          positions: [
            { row: 0, col: 0 },
            { row: 0, col: 1 },
            { row: 0, col: 2 },
          ],
          type: "red",
          score: 300,
        },
        {
          positions: [
            { row: 2, col: 0 },
            { row: 2, col: 1 },
            { row: 2, col: 2 },
          ],
          type: "blue",
          score: 300,
        },
      ];

      const result = removeDuplicateMatches(matches);

      expect(result).toHaveLength(2);
    });

    test("should handle empty matches array", () => {
      const result = removeDuplicateMatches([]);
      expect(result).toHaveLength(0);
    });
  });

  describe("findMatches integration", () => {
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
  });
});
