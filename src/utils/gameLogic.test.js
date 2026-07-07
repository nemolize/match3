import { describe, expect, test } from "vitest";

import {
  applyGravity,
  createInitialBoard,
  fillEmptySpaces,
  generateId,
  getRandomGemType,
  hasValidMoves,
  isValidSwap,
  removeMatches,
  swapGems,
} from "@/utils/gameLogic";

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

describe("Game Logic", () => {
  describe("generateId", () => {
    test("should generate unique IDs", () => {
      const ids = new Set();
      for (let i = 0; i < 1000; i++) {
        ids.add(generateId());
      }
      expect(ids.size).toBe(1000);
    });

    test("should generate string IDs", () => {
      const id = generateId();
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);
    });
  });

  describe("getRandomGemType", () => {
    test("should return valid gem types", () => {
      const validTypes = ["red", "blue", "green", "yellow", "purple", "orange"];
      for (let i = 0; i < 100; i++) {
        const type = getRandomGemType();
        expect(validTypes).toContain(type);
      }
    });
  });

  describe("createInitialBoard", () => {
    test("should create 8x8 board", () => {
      const board = createInitialBoard();
      expect(board).toHaveLength(8);
      expect(board[0]).toHaveLength(8);
    });

    test("should fill board with gems", () => {
      const board = createInitialBoard();
      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
          const gem = board[row][col];
          expect(gem).not.toBeNull();
          expect(gem.id).toBeDefined();
          expect(gem.type).toBeDefined();
          expect(gem.position).toEqual({ row, col });
        }
      }
    });

    test("should not create matches on initial board", () => {
      // Test multiple times as it's random
      for (let i = 0; i < 10; i++) {
        const board = createInitialBoard();
        // Check no horizontal matches
        for (let row = 0; row < 8; row++) {
          for (let col = 0; col < 6; col++) {
            const gem1 = board[row][col];
            const gem2 = board[row][col + 1];
            const gem3 = board[row][col + 2];
            expect(gem1.type === gem2.type && gem2.type === gem3.type).toBe(
              false,
            );
          }
        }
        // Check no vertical matches
        for (let col = 0; col < 8; col++) {
          for (let row = 0; row < 6; row++) {
            const gem1 = board[row][col];
            const gem2 = board[row + 1][col];
            const gem3 = board[row + 2][col];
            expect(gem1.type === gem2.type && gem2.type === gem3.type).toBe(
              false,
            );
          }
        }
      }
    });
  });

  describe("swapGems", () => {
    test("should swap two gems", () => {
      const board = createEmptyBoard();
      board[0][0] = createGem("red", 0, 0);
      board[0][1] = createGem("blue", 0, 1);

      const newBoard = swapGems(board, { row: 0, col: 0 }, { row: 0, col: 1 });

      expect(newBoard[0][0].type).toBe("blue");
      expect(newBoard[0][1].type).toBe("red");
      // Positions should be updated
      expect(newBoard[0][0].position).toEqual({ row: 0, col: 0 });
      expect(newBoard[0][1].position).toEqual({ row: 0, col: 1 });
    });

    test("should handle swapping with null", () => {
      const board = createEmptyBoard();
      board[0][0] = createGem("red", 0, 0);
      board[0][1] = null;

      const newBoard = swapGems(board, { row: 0, col: 0 }, { row: 0, col: 1 });

      expect(newBoard[0][0]).toBeNull();
      expect(newBoard[0][1].type).toBe("red");
      expect(newBoard[0][1].position).toEqual({ row: 0, col: 1 });
    });

    test("should not modify original board", () => {
      const board = createEmptyBoard();
      board[0][0] = createGem("red", 0, 0);
      board[0][1] = createGem("blue", 0, 1);
      const originalGem1 = board[0][0];
      const originalGem2 = board[0][1];

      swapGems(board, { row: 0, col: 0 }, { row: 0, col: 1 });

      expect(board[0][0]).toBe(originalGem1);
      expect(board[0][1]).toBe(originalGem2);
    });

    test("should not mutate the original gems' positions", () => {
      const board = createEmptyBoard();
      board[0][0] = createGem("red", 0, 0);
      board[0][1] = createGem("blue", 0, 1);

      swapGems(board, { row: 0, col: 0 }, { row: 0, col: 1 });

      expect(board[0][0].position).toEqual({ row: 0, col: 0 });
      expect(board[0][1].position).toEqual({ row: 0, col: 1 });
    });
  });

  describe("isValidSwap", () => {
    test("should allow swap that creates horizontal match", () => {
      const board = createEmptyBoard();
      board[0][0] = createGem("red", 0, 0);
      board[0][1] = createGem("blue", 0, 1);
      board[0][2] = createGem("red", 0, 2);
      board[0][3] = createGem("red", 0, 3);
      // Fill rest to avoid other potential matches
      for (let row = 1; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
          board[row][col] = createGem("green", row, col);
        }
      }

      const isValid = isValidSwap(
        board,
        { row: 0, col: 0 },
        { row: 0, col: 1 },
      );

      expect(isValid).toBe(true);
    });

    test("should allow swap that creates vertical match", () => {
      const board = createEmptyBoard();
      board[0][0] = createGem("red", 0, 0);
      board[1][0] = createGem("blue", 1, 0);
      board[2][0] = createGem("red", 2, 0);
      board[3][0] = createGem("red", 3, 0);
      // Fill rest to avoid other potential matches
      for (let row = 4; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
          board[row][col] = createGem("green", row, col);
        }
      }
      for (let row = 0; row < 8; row++) {
        for (let col = 1; col < 8; col++) {
          board[row][col] = createGem("yellow", row, col);
        }
      }

      const isValid = isValidSwap(
        board,
        { row: 0, col: 0 },
        { row: 1, col: 0 },
      );

      expect(isValid).toBe(true);
    });

    test("should not allow swap that creates no match", () => {
      const board = createEmptyBoard();
      board[0][0] = createGem("red", 0, 0);
      board[0][1] = createGem("blue", 0, 1);
      board[0][2] = createGem("green", 0, 2);
      board[1][0] = createGem("yellow", 1, 0);

      const isValid = isValidSwap(
        board,
        { row: 0, col: 0 },
        { row: 0, col: 1 },
      );

      expect(isValid).toBe(false);
    });

    test("should only allow adjacent swaps", () => {
      const board = createEmptyBoard();
      board[0][0] = createGem("red", 0, 0);
      board[0][2] = createGem("blue", 0, 2);

      const isValid = isValidSwap(
        board,
        { row: 0, col: 0 },
        { row: 0, col: 2 },
      );

      expect(isValid).toBe(false);
    });

    test("should not mutate the board while simulating the swap", () => {
      const board = createEmptyBoard();
      board[0][0] = createGem("red", 0, 0);
      board[0][1] = createGem("blue", 0, 1);
      const originalGem1 = board[0][0];
      const originalGem2 = board[0][1];

      isValidSwap(board, { row: 0, col: 0 }, { row: 0, col: 1 });

      expect(board[0][0]).toBe(originalGem1);
      expect(board[0][1]).toBe(originalGem2);
      expect(board[0][0].position).toEqual({ row: 0, col: 0 });
      expect(board[0][1].position).toEqual({ row: 0, col: 1 });
    });
  });

  describe("removeMatches", () => {
    test("should remove matched gems", () => {
      const board = createEmptyBoard();
      board[0][0] = createGem("red", 0, 0);
      board[0][1] = createGem("red", 0, 1);
      board[0][2] = createGem("red", 0, 2);

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
      ];

      const newBoard = removeMatches(board, matches);

      expect(newBoard[0][0]).toBeNull();
      expect(newBoard[0][1]).toBeNull();
      expect(newBoard[0][2]).toBeNull();
    });

    test("should not affect unmatched gems", () => {
      const board = createEmptyBoard();
      board[0][0] = createGem("red", 0, 0);
      board[0][1] = createGem("red", 0, 1);
      board[0][2] = createGem("red", 0, 2);
      board[0][3] = createGem("blue", 0, 3);

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
      ];

      const newBoard = removeMatches(board, matches);

      expect(newBoard[0][3]).not.toBeNull();
      expect(newBoard[0][3].type).toBe("blue");
    });
  });

  describe("applyGravity", () => {
    test("should make gems fall to bottom", () => {
      const board = createEmptyBoard();
      board[0][0] = createGem("red", 0, 0);
      board[2][0] = createGem("blue", 2, 0);
      // Empty spaces at [1][0], [3][0], etc.

      const newBoard = applyGravity(board);

      // Gems should fall to bottom
      expect(newBoard[6][0].type).toBe("red");
      expect(newBoard[7][0].type).toBe("blue");
      // Top should be empty
      expect(newBoard[0][0]).toBeNull();
      expect(newBoard[1][0]).toBeNull();
    });

    test("should maintain column order when falling", () => {
      const board = createEmptyBoard();
      board[0][0] = createGem("red", 0, 0);
      board[1][0] = createGem("blue", 1, 0);
      board[2][0] = createGem("green", 2, 0);
      board[4][0] = null; // gap

      const newBoard = applyGravity(board);

      // Order should be maintained
      expect(newBoard[5][0].type).toBe("red");
      expect(newBoard[6][0].type).toBe("blue");
      expect(newBoard[7][0].type).toBe("green");
    });

    test("should update gem positions after falling", () => {
      const board = createEmptyBoard();
      board[0][0] = createGem("red", 0, 0);

      const newBoard = applyGravity(board);

      expect(newBoard[7][0].position).toEqual({ row: 7, col: 0 });
    });
  });

  describe("fillEmptySpaces", () => {
    test("should fill all null spaces with new gems", () => {
      const board = createEmptyBoard();
      // Leave some spaces filled
      board[7][0] = createGem("red", 7, 0);
      board[7][1] = createGem("blue", 7, 1);

      const newBoard = fillEmptySpaces(board);

      // Check all spaces are filled
      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
          expect(newBoard[row][col]).not.toBeNull();
        }
      }
    });

    test("should preserve existing gems", () => {
      const board = createEmptyBoard();
      const existingGem = createGem("red", 7, 0);
      board[7][0] = existingGem;

      const newBoard = fillEmptySpaces(board);

      expect(newBoard[7][0]).toBe(existingGem);
    });

    test("should assign correct positions to new gems", () => {
      const board = createEmptyBoard();

      const newBoard = fillEmptySpaces(board);

      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
          const gem = newBoard[row][col];
          expect(gem.position).toEqual({ row, col });
        }
      }
    });
  });

  describe("hasValidMoves", () => {
    test("should return true when valid moves exist", () => {
      const board = createEmptyBoard();
      // Create a setup where swapping [0][0] and [0][1] creates a match
      board[0][0] = createGem("red", 0, 0);
      board[0][1] = createGem("blue", 0, 1);
      board[0][2] = createGem("red", 0, 2);
      board[0][3] = createGem("red", 0, 3);
      // Fill rest with alternating colors to avoid other matches
      for (let row = 1; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
          board[row][col] = createGem(
            (row + col) % 2 === 0 ? "green" : "yellow",
            row,
            col,
          );
        }
      }

      expect(hasValidMoves(board)).toBe(true);
    });

    test("should return false when no valid moves exist", () => {
      const board = createEmptyBoard();
      // Create a more complex pattern that truly has no valid moves
      // Use 3 colors in a pattern that prevents any 3-in-a-row formation
      const colors = ["red", "blue", "green"];
      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
          // Use a pattern that cycles through 3 colors to prevent matches
          const colorIndex = (row * 8 + col) % 3;
          board[row][col] = createGem(colors[colorIndex], row, col);
        }
      }

      expect(hasValidMoves(board)).toBe(false);
    });

    test("should handle boards with null spaces", () => {
      const board = createEmptyBoard();
      // Partially filled board
      board[0][0] = createGem("red", 0, 0);
      board[0][1] = createGem("blue", 0, 1);
      board[1][0] = createGem("red", 1, 0);
      board[2][0] = createGem("red", 2, 0);

      expect(hasValidMoves(board)).toBe(true);
    });
  });
});
