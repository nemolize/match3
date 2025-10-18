import { describe, expect, test } from "vitest";

import { findMultipleAxisMatches } from "./multiAxisMatches";
import { createEmptyBoard, createGem } from "./testHelpers";

describe("Multi-Axis Matches", () => {
  describe("L-shape detection", () => {
    test("should find L-shape with vertical up and horizontal right", () => {
      const board = createEmptyBoard();
      // Create L-shape: vertical going up, horizontal going right
      // Corner at (4, 2), vertical extends up only, horizontal extends right only
      board[4][2] = createGem("red", 4, 2); // Corner
      board[3][2] = createGem("red", 3, 2); // Up
      board[2][2] = createGem("red", 2, 2); // Up
      board[4][3] = createGem("red", 4, 3); // Right
      board[4][4] = createGem("red", 4, 4); // Right

      const matches = findMultipleAxisMatches(board);

      expect(matches.length).toBeGreaterThan(0);
      const lShape = matches.find((m) => m.positions.length === 5);
      expect(lShape).toBeDefined();
      expect(lShape.type).toBe("red");
      expect(lShape.score).toBe(1000); // 5 * 200
    });

    test("should find L-shape with vertical down and horizontal left", () => {
      const board = createEmptyBoard();
      // Create L-shape: vertical going down, horizontal going left
      // Corner at (1, 5), vertical extends down only, horizontal extends left only
      board[1][5] = createGem("blue", 1, 5); // Corner
      board[2][5] = createGem("blue", 2, 5); // Down
      board[3][5] = createGem("blue", 3, 5); // Down
      board[1][4] = createGem("blue", 1, 4); // Left
      board[1][3] = createGem("blue", 1, 3); // Left

      const matches = findMultipleAxisMatches(board);

      expect(matches.length).toBeGreaterThan(0);
      const lShape = matches.find((m) => m.positions.length === 5);
      expect(lShape).toBeDefined();
      expect(lShape.type).toBe("blue");
      expect(lShape.score).toBe(1000); // 5 * 200
    });

    test("should find L-shape with vertical up and horizontal left", () => {
      const board = createEmptyBoard();
      // Create L-shape: vertical going up, horizontal going left
      // Corner at (5, 5), vertical extends up only, horizontal extends left only
      board[5][5] = createGem("green", 5, 5); // Corner
      board[4][5] = createGem("green", 4, 5); // Up
      board[3][5] = createGem("green", 3, 5); // Up
      board[5][4] = createGem("green", 5, 4); // Left
      board[5][3] = createGem("green", 5, 3); // Left

      const matches = findMultipleAxisMatches(board);

      expect(matches.length).toBeGreaterThan(0);
      const lShape = matches.find((m) => m.positions.length === 5);
      expect(lShape).toBeDefined();
      expect(lShape.type).toBe("green");
      expect(lShape.score).toBe(1000); // 5 * 200
    });

    test("should find L-shape with vertical down and horizontal right", () => {
      const board = createEmptyBoard();
      // Create L-shape: vertical going down, horizontal going right
      // Corner at (0, 1), vertical extends down only, horizontal extends right only
      board[0][1] = createGem("yellow", 0, 1); // Corner
      board[1][1] = createGem("yellow", 1, 1); // Down
      board[2][1] = createGem("yellow", 2, 1); // Down
      board[0][2] = createGem("yellow", 0, 2); // Right
      board[0][3] = createGem("yellow", 0, 3); // Right

      const matches = findMultipleAxisMatches(board);

      expect(matches.length).toBeGreaterThan(0);
      const lShape = matches.find((m) => m.positions.length === 5);
      expect(lShape).toBeDefined();
      expect(lShape.type).toBe("yellow");
      expect(lShape.score).toBe(1000); // 5 * 200
    });

    test("should find L-shape with different lengths (3x3)", () => {
      const board = createEmptyBoard();
      // Minimal L-shape: 3 vertical + 3 horizontal (sharing corner)
      // Corner at (5, 3), vertical extends up only, horizontal extends right only
      board[5][3] = createGem("purple", 5, 3); // Corner
      board[4][3] = createGem("purple", 4, 3); // Up
      board[3][3] = createGem("purple", 3, 3); // Up
      board[5][4] = createGem("purple", 5, 4); // Right
      board[5][5] = createGem("purple", 5, 5); // Right

      const matches = findMultipleAxisMatches(board);

      expect(matches.length).toBeGreaterThan(0);
      const lShape = matches.find((m) => m.score === 1000);
      expect(lShape).toBeDefined();
      expect(lShape.positions.length).toBe(5);
    });

    test("should find L-shape with longer arms (4x5)", () => {
      const board = createEmptyBoard();
      // L-shape with 4 vertical + 5 horizontal
      // Corner at (5, 2), vertical extends up only, horizontal extends right only
      board[5][2] = createGem("orange", 5, 2); // Corner
      // Vertical arm (4 gems total including corner)
      board[4][2] = createGem("orange", 4, 2);
      board[3][2] = createGem("orange", 3, 2);
      board[2][2] = createGem("orange", 2, 2);
      // Horizontal arm (5 gems total including corner)
      board[5][3] = createGem("orange", 5, 3);
      board[5][4] = createGem("orange", 5, 4);
      board[5][5] = createGem("orange", 5, 5);
      board[5][6] = createGem("orange", 5, 6);

      const matches = findMultipleAxisMatches(board);

      expect(matches.length).toBeGreaterThan(0);
      const lShape = matches.find((m) => m.positions.length === 8);
      expect(lShape).toBeDefined();
      expect(lShape.type).toBe("orange");
      expect(lShape.score).toBe(1600); // 8 * 200
    });

    test("should not find L-shape with insufficient vertical arm", () => {
      const board = createEmptyBoard();
      // Only 2 vertical gems (not enough)
      board[3][3] = createGem("red", 3, 3);
      board[2][3] = createGem("red", 2, 3);
      // 3 horizontal gems
      board[3][4] = createGem("red", 3, 4);
      board[3][5] = createGem("red", 3, 5);

      const matches = findMultipleAxisMatches(board);

      // Should not find L-shape (may find horizontal match)
      const lShape = matches.find(
        (m) => m.positions.length === 4 && m.score === 800,
      );
      expect(lShape).toBeUndefined();
    });

    test("should not find L-shape with insufficient horizontal arm", () => {
      const board = createEmptyBoard();
      // 3 vertical gems
      board[3][3] = createGem("blue", 3, 3);
      board[2][3] = createGem("blue", 2, 3);
      board[1][3] = createGem("blue", 1, 3);
      // Only 2 horizontal gems (not enough)
      board[3][4] = createGem("blue", 3, 4);

      const matches = findMultipleAxisMatches(board);

      // Should not find L-shape (may find vertical match)
      const lShape = matches.find(
        (m) => m.positions.length === 4 && m.score === 800,
      );
      expect(lShape).toBeUndefined();
    });
  });

  describe("+-shape detection", () => {
    test("should find +-shape with minimal size (3x3)", () => {
      const board = createEmptyBoard();
      // Create +-shape centered at (3, 3)
      // Vertical line
      board[2][3] = createGem("red", 2, 3); // Up
      board[3][3] = createGem("red", 3, 3); // Center
      board[4][3] = createGem("red", 4, 3); // Down
      // Horizontal line
      board[3][2] = createGem("red", 3, 2); // Left
      board[3][4] = createGem("red", 3, 4); // Right

      const matches = findMultipleAxisMatches(board);

      expect(matches.length).toBeGreaterThan(0);
      const plusShape = matches.find((m) => m.positions.length === 5);
      expect(plusShape).toBeDefined();
      expect(plusShape.type).toBe("red");
      expect(plusShape.score).toBe(1250); // 5 * 250
    });

    test("should find +-shape with longer arms", () => {
      const board = createEmptyBoard();
      // Create larger +-shape centered at (4, 4)
      // Vertical line (5 gems)
      board[2][4] = createGem("blue", 2, 4);
      board[3][4] = createGem("blue", 3, 4);
      board[4][4] = createGem("blue", 4, 4); // Center
      board[5][4] = createGem("blue", 5, 4);
      board[6][4] = createGem("blue", 6, 4);
      // Horizontal line (5 gems)
      board[4][2] = createGem("blue", 4, 2);
      board[4][3] = createGem("blue", 4, 3);
      board[4][5] = createGem("blue", 4, 5);
      board[4][6] = createGem("blue", 4, 6);

      const matches = findMultipleAxisMatches(board);

      expect(matches.length).toBeGreaterThan(0);
      const plusShape = matches.find((m) => m.positions.length === 9);
      expect(plusShape).toBeDefined();
      expect(plusShape.type).toBe("blue");
      expect(plusShape.score).toBe(2250); // 9 * 250
    });

    test("should find +-shape with asymmetric arms", () => {
      const board = createEmptyBoard();
      // +-shape with different arm lengths
      // Vertical: 4 gems total
      board[2][3] = createGem("green", 2, 3);
      board[3][3] = createGem("green", 3, 3); // Center
      board[4][3] = createGem("green", 4, 3);
      board[5][3] = createGem("green", 5, 3);
      // Horizontal: 5 gems total
      board[3][1] = createGem("green", 3, 1);
      board[3][2] = createGem("green", 3, 2);
      board[3][4] = createGem("green", 3, 4);
      board[3][5] = createGem("green", 3, 5);

      const matches = findMultipleAxisMatches(board);

      expect(matches.length).toBeGreaterThan(0);
      const plusShape = matches.find((m) => m.positions.length === 8);
      expect(plusShape).toBeDefined();
      expect(plusShape.type).toBe("green");
      expect(plusShape.score).toBe(2000); // 8 * 250
    });

    test("should not find +-shape with insufficient vertical line", () => {
      const board = createEmptyBoard();
      // Only 2 vertical gems
      board[3][3] = createGem("yellow", 3, 3);
      board[4][3] = createGem("yellow", 4, 3);
      // 3 horizontal gems
      board[3][2] = createGem("yellow", 3, 2);
      board[3][4] = createGem("yellow", 3, 4);

      const matches = findMultipleAxisMatches(board);

      // Should not find +-shape
      const plusShape = matches.find(
        (m) => m.score === 1000 && m.positions.length === 4,
      );
      expect(plusShape).toBeUndefined();
    });

    test("should not find +-shape with insufficient horizontal line", () => {
      const board = createEmptyBoard();
      // 3 vertical gems
      board[2][3] = createGem("purple", 2, 3);
      board[3][3] = createGem("purple", 3, 3);
      board[4][3] = createGem("purple", 4, 3);
      // Only 2 horizontal gems
      board[3][2] = createGem("purple", 3, 2);

      const matches = findMultipleAxisMatches(board);

      // Should not find +-shape (may find vertical match)
      const plusShape = matches.find(
        (m) => m.score === 1000 && m.positions.length === 4,
      );
      expect(plusShape).toBeUndefined();
    });

    test("should handle +-shape at board edges", () => {
      const board = createEmptyBoard();
      // +-shape near top edge
      // Vertical line (can only go down from row 0)
      board[0][4] = createGem("orange", 0, 4); // Center at top
      board[1][4] = createGem("orange", 1, 4);
      board[2][4] = createGem("orange", 2, 4);
      // Horizontal line
      board[0][3] = createGem("orange", 0, 3);
      board[0][5] = createGem("orange", 0, 5);

      const matches = findMultipleAxisMatches(board);

      expect(matches.length).toBeGreaterThan(0);
      const plusShape = matches.find((m) => m.positions.length === 5);
      expect(plusShape).toBeDefined();
      expect(plusShape.type).toBe("orange");
    });
  });

  describe("T-shape detection (|+ patterns)", () => {
    test("should find T-shape with horizontal at top (⊤)", () => {
      const board = createEmptyBoard();
      // Vertical line going down from top
      board[0][3] = createGem("red", 0, 3); // Top (end of vertical, center of horizontal)
      board[1][3] = createGem("red", 1, 3); // Down
      board[2][3] = createGem("red", 2, 3); // Down
      // Horizontal line at top
      board[0][2] = createGem("red", 0, 2); // Left
      board[0][4] = createGem("red", 0, 4); // Right

      const matches = findMultipleAxisMatches(board);

      expect(matches.length).toBeGreaterThan(0);
      const tShape = matches.find((m) => m.positions.length === 5);
      expect(tShape).toBeDefined();
      expect(tShape.type).toBe("red");
      expect(tShape.score).toBe(1125); // 5 * 225
    });

    test("should find T-shape with horizontal at bottom (⊥)", () => {
      const board = createEmptyBoard();
      // Vertical line going up from bottom
      board[3][3] = createGem("blue", 3, 3); // Up
      board[4][3] = createGem("blue", 4, 3); // Up
      board[5][3] = createGem("blue", 5, 3); // Bottom (end of vertical, center of horizontal)
      // Horizontal line at bottom
      board[5][2] = createGem("blue", 5, 2); // Left
      board[5][4] = createGem("blue", 5, 4); // Right

      const matches = findMultipleAxisMatches(board);

      expect(matches.length).toBeGreaterThan(0);
      const tShape = matches.find((m) => m.positions.length === 5);
      expect(tShape).toBeDefined();
      expect(tShape.type).toBe("blue");
      expect(tShape.score).toBe(1125); // 5 * 225
    });

    test("should find T-shape with vertical on left (⊢)", () => {
      const board = createEmptyBoard();
      // Horizontal line going right
      board[3][2] = createGem("green", 3, 2); // Left (end of horizontal, center of vertical)
      board[3][3] = createGem("green", 3, 3); // Right
      board[3][4] = createGem("green", 3, 4); // Right
      // Vertical line at left
      board[2][2] = createGem("green", 2, 2); // Up
      board[4][2] = createGem("green", 4, 2); // Down

      const matches = findMultipleAxisMatches(board);

      expect(matches.length).toBeGreaterThan(0);
      const tShape = matches.find((m) => m.positions.length === 5);
      expect(tShape).toBeDefined();
      expect(tShape.type).toBe("green");
      expect(tShape.score).toBe(1125); // 5 * 225
    });

    test("should find T-shape with vertical on right (⊣)", () => {
      const board = createEmptyBoard();
      // Horizontal line going left
      board[3][3] = createGem("yellow", 3, 3); // Left
      board[3][4] = createGem("yellow", 3, 4); // Left
      board[3][5] = createGem("yellow", 3, 5); // Right (end of horizontal, center of vertical)
      // Vertical line at right
      board[2][5] = createGem("yellow", 2, 5); // Up
      board[4][5] = createGem("yellow", 4, 5); // Down

      const matches = findMultipleAxisMatches(board);

      expect(matches.length).toBeGreaterThan(0);
      const tShape = matches.find((m) => m.positions.length === 5);
      expect(tShape).toBeDefined();
      expect(tShape.type).toBe("yellow");
      expect(tShape.score).toBe(1125); // 5 * 225
    });

    test("should find T-shape with longer arms", () => {
      const board = createEmptyBoard();
      // Vertical line (5 gems)
      board[0][3] = createGem("purple", 0, 3); // Top (end)
      board[1][3] = createGem("purple", 1, 3);
      board[2][3] = createGem("purple", 2, 3);
      board[3][3] = createGem("purple", 3, 3);
      board[4][3] = createGem("purple", 4, 3);
      // Horizontal line at top (4 gems)
      board[0][1] = createGem("purple", 0, 1);
      board[0][2] = createGem("purple", 0, 2);
      board[0][4] = createGem("purple", 0, 4);

      const matches = findMultipleAxisMatches(board);

      expect(matches.length).toBeGreaterThan(0);
      const tShape = matches.find((m) => m.positions.length === 8);
      expect(tShape).toBeDefined();
      expect(tShape.type).toBe("purple");
      expect(tShape.score).toBe(1800); // 8 * 225
    });
  });

  describe("Multiple intersection patterns (++)", () => {
    test("should find pattern with 2 horizontal intersections", () => {
      const board = createEmptyBoard();
      // Long vertical line
      board[1][3] = createGem("red", 1, 3);
      board[2][3] = createGem("red", 2, 3);
      board[3][3] = createGem("red", 3, 3);
      board[4][3] = createGem("red", 4, 3);
      board[5][3] = createGem("red", 5, 3);
      // First horizontal crossing
      board[2][2] = createGem("red", 2, 2);
      board[2][4] = createGem("red", 2, 4);
      // Second horizontal crossing
      board[4][2] = createGem("red", 4, 2);
      board[4][4] = createGem("red", 4, 4);

      const matches = findMultipleAxisMatches(board);

      expect(matches.length).toBeGreaterThan(0);
      // Should find multiple intersection pattern
      const multiPattern = matches.find((m) => m.score >= 2400); // At least 8 gems * 300
      expect(multiPattern).toBeDefined();
      expect(multiPattern.type).toBe("red");
    });

    test("should find pattern with 2 vertical intersections", () => {
      const board = createEmptyBoard();
      // Long horizontal line
      board[3][1] = createGem("blue", 3, 1);
      board[3][2] = createGem("blue", 3, 2);
      board[3][3] = createGem("blue", 3, 3);
      board[3][4] = createGem("blue", 3, 4);
      board[3][5] = createGem("blue", 3, 5);
      // First vertical crossing
      board[2][2] = createGem("blue", 2, 2);
      board[4][2] = createGem("blue", 4, 2);
      // Second vertical crossing
      board[2][4] = createGem("blue", 2, 4);
      board[4][4] = createGem("blue", 4, 4);

      const matches = findMultipleAxisMatches(board);

      expect(matches.length).toBeGreaterThan(0);
      // Should find multiple intersection pattern
      const multiPattern = matches.find((m) => m.score >= 2400); // At least 8 gems * 300
      expect(multiPattern).toBeDefined();
      expect(multiPattern.type).toBe("blue");
    });

    test("should find grid-like pattern with 3 intersections", () => {
      const board = createEmptyBoard();
      // Long vertical line
      board[1][3] = createGem("green", 1, 3);
      board[2][3] = createGem("green", 2, 3);
      board[3][3] = createGem("green", 3, 3);
      board[4][3] = createGem("green", 4, 3);
      board[5][3] = createGem("green", 5, 3);
      board[6][3] = createGem("green", 6, 3);
      // Three horizontal crossings
      board[2][2] = createGem("green", 2, 2);
      board[2][4] = createGem("green", 2, 4);
      board[4][2] = createGem("green", 4, 2);
      board[4][4] = createGem("green", 4, 4);
      board[5][2] = createGem("green", 5, 2);
      board[5][4] = createGem("green", 5, 4);

      const matches = findMultipleAxisMatches(board);

      expect(matches.length).toBeGreaterThan(0);
      // Should find complex multi-intersection pattern
      const complexPattern = matches.find((m) => m.score >= 3000); // At least 10 gems * 300
      expect(complexPattern).toBeDefined();
      expect(complexPattern.type).toBe("green");
    });

    test("should prioritize multiple intersections over simpler shapes", () => {
      const board = createEmptyBoard();
      // Pattern that could be interpreted as multiple shapes
      // but should be recognized as multi-intersection
      board[2][3] = createGem("orange", 2, 3);
      board[3][3] = createGem("orange", 3, 3);
      board[4][3] = createGem("orange", 4, 3);
      board[5][3] = createGem("orange", 5, 3);
      // Two horizontal lines crossing the vertical
      board[3][2] = createGem("orange", 3, 2);
      board[3][4] = createGem("orange", 3, 4);
      board[4][2] = createGem("orange", 4, 2);
      board[4][4] = createGem("orange", 4, 4);

      const matches = findMultipleAxisMatches(board);

      expect(matches.length).toBeGreaterThan(0);
      // Should find as multi-intersection with score 300 per gem
      const multiPattern = matches.find((m) => m.score >= 2100); // 7+ gems * 300
      expect(multiPattern).toBeDefined();
    });
  });

  test("should not duplicate same shape multiple times", () => {
    const board = createEmptyBoard();
    // Create a +-shape
    board[3][3] = createGem("red", 3, 3);
    board[2][3] = createGem("red", 2, 3);
    board[4][3] = createGem("red", 4, 3);
    board[3][2] = createGem("red", 3, 2);
    board[3][4] = createGem("red", 3, 4);

    const matches = findMultipleAxisMatches(board);

    // Should find exactly one +-shape, not multiple
    const plusShapes = matches.filter((m) => m.score === 1250);
    expect(plusShapes.length).toBe(1);
  });

  test("should handle multiple complex shapes on same board", () => {
    const board = createEmptyBoard();
    // First +-shape (red)
    board[1][1] = createGem("red", 1, 1);
    board[1][2] = createGem("red", 1, 2);
    board[1][3] = createGem("red", 1, 3);
    board[0][2] = createGem("red", 0, 2);
    board[2][2] = createGem("red", 2, 2);

    // Second L-shape (blue) - separate
    board[5][5] = createGem("blue", 5, 5);
    board[4][5] = createGem("blue", 4, 5);
    board[3][5] = createGem("blue", 3, 5);
    board[5][6] = createGem("blue", 5, 6);
    board[5][7] = createGem("blue", 5, 7);

    const matches = findMultipleAxisMatches(board);

    expect(matches.length).toBeGreaterThanOrEqual(2);
    const redShape = matches.find((m) => m.type === "red");
    const blueShape = matches.find((m) => m.type === "blue");
    expect(redShape).toBeDefined();
    expect(blueShape).toBeDefined();
  });
});
