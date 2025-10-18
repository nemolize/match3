import { BOARD_SIZE } from "@/constants/game";
import type { Gem, Match, Position } from "@/types/game";

/**
 * Finds all rectangular matches (2x2, 2x3, and 3x2)
 */
export const findRectangularMatches = (board: (Gem | null)[][]): Match[] => {
  const matches: Match[] = [];
  const processedRectangles = new Set<string>();

  // Helper to check if a rectangle of same-colored gems exists
  const checkRectangle = (
    startRow: number,
    startCol: number,
    rows: number,
    cols: number,
  ): Match | null => {
    // Check bounds
    if (startRow + rows > BOARD_SIZE || startCol + cols > BOARD_SIZE) {
      return null;
    }

    const firstGem = board[startRow]?.[startCol];
    if (!firstGem) return null;

    const positions: Position[] = [];
    const gemType = firstGem.type;

    // Check if all gems in rectangle match
    for (let r = startRow; r < startRow + rows; r++) {
      for (let c = startCol; c < startCol + cols; c++) {
        const gem = board[r]?.[c];
        if (!gem || gem.type !== gemType) {
          return null;
        }
        positions.push({ row: r, col: c });
      }
    }

    // Create unique key for this rectangle
    const key = `${startRow},${startCol},${rows},${cols}`;
    if (processedRectangles.has(key)) {
      return null;
    }
    processedRectangles.add(key);

    // Calculate score based on rectangle size
    const gemCount = rows * cols;
    const score = gemCount * 150; // Higher multiplier for rectangular matches

    return {
      positions,
      type: gemType,
      score,
    };
  };

  // Scan board for all possible rectangles
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      // Check 2x2
      const match2x2 = checkRectangle(row, col, 2, 2);
      if (match2x2) matches.push(match2x2);

      // Check 2x3
      const match2x3 = checkRectangle(row, col, 2, 3);
      if (match2x3) matches.push(match2x3);

      // Check 3x2
      const match3x2 = checkRectangle(row, col, 3, 2);
      if (match3x2) matches.push(match3x2);
    }
  }

  return matches;
};
