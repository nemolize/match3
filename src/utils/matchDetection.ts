import { BOARD_SIZE, MIN_MATCH_LENGTH } from "@/constants/game";
import type { Gem, GemType, Match, Position } from "@/types/game";

/**
 * Finds all horizontal matches of 3 or more consecutive gems
 */
export const findHorizontalMatches = (board: (Gem | null)[][]): Match[] => {
  const matches: Match[] = [];

  for (let row = 0; row < BOARD_SIZE; row++) {
    let currentStreak: Position[] = [];
    let currentType: GemType | null = null;

    for (let col = 0; col < BOARD_SIZE; col++) {
      const gem = board[row]?.[col];

      if (gem && gem.type === currentType) {
        // Continue streak
        currentStreak.push({ row, col });
      } else if (gem) {
        // Check if previous streak was valid
        if (currentStreak.length >= MIN_MATCH_LENGTH && currentType) {
          matches.push({
            positions: [...currentStreak],
            type: currentType,
            score: currentStreak.length * 100,
          });
        }

        // Start new streak
        currentStreak = [{ row, col }];
        currentType = gem.type;
      } else {
        // Empty space - check if previous streak was valid
        if (currentStreak.length >= MIN_MATCH_LENGTH && currentType) {
          matches.push({
            positions: [...currentStreak],
            type: currentType,
            score: currentStreak.length * 100,
          });
        }

        // Reset streak
        currentStreak = [];
        currentType = null;
      }
    }

    // Check final streak at end of row
    if (currentStreak.length >= MIN_MATCH_LENGTH && currentType) {
      matches.push({
        positions: [...currentStreak],
        type: currentType,
        score: currentStreak.length * 100,
      });
    }
  }

  return matches;
};

/**
 * Finds all vertical matches of 3 or more consecutive gems
 */
export const findVerticalMatches = (board: (Gem | null)[][]): Match[] => {
  const matches: Match[] = [];

  for (let col = 0; col < BOARD_SIZE; col++) {
    let currentStreak: Position[] = [];
    let currentType: GemType | null = null;

    for (let row = 0; row < BOARD_SIZE; row++) {
      const gem = board[row]?.[col];

      if (gem && gem.type === currentType) {
        // Continue streak
        currentStreak.push({ row, col });
      } else if (gem) {
        // Check if previous streak was valid
        if (currentStreak.length >= MIN_MATCH_LENGTH && currentType) {
          matches.push({
            positions: [...currentStreak],
            type: currentType,
            score: currentStreak.length * 100,
          });
        }

        // Start new streak
        currentStreak = [{ row, col }];
        currentType = gem.type;
      } else {
        // Empty space - check if previous streak was valid
        if (currentStreak.length >= MIN_MATCH_LENGTH && currentType) {
          matches.push({
            positions: [...currentStreak],
            type: currentType,
            score: currentStreak.length * 100,
          });
        }

        // Reset streak
        currentStreak = [];
        currentType = null;
      }
    }

    // Check final streak at end of column
    if (currentStreak.length >= MIN_MATCH_LENGTH && currentType) {
      matches.push({
        positions: [...currentStreak],
        type: currentType,
        score: currentStreak.length * 100,
      });
    }
  }

  return matches;
};

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

/**
 * Finds all multiple-axis matches where horizontal and vertical lines intersect
 * - +-shape: intersection at center of both lines (highest score)
 * - T-shape: intersection at center of one line, end of the other (⊤⊥⊢⊣)
 * - L-shape: intersection at corner (end of both lines)
 * - Multiple intersections: complex patterns where one line crosses multiple perpendicular lines
 */
export const findMultipleAxisMatches = (board: (Gem | null)[][]): Match[] => {
  const matches: Match[] = [];
  const processedShapes = new Set<string>();

  // Get all horizontal and vertical line matches
  const horizontalMatches = findHorizontalMatches(board);
  const verticalMatches = findVerticalMatches(board);

  // Helper to check if a position is in a match
  const hasPosition = (match: Match, row: number, col: number): boolean => {
    return match.positions.some((p) => p.row === row && p.col === col);
  };

  // Helper to check if position is at the center of a line match
  const isCenter = (match: Match, row: number, col: number): boolean => {
    const idx = match.positions.findIndex(
      (p) => p.row === row && p.col === col,
    );
    if (idx === -1) return false;
    const mid = Math.floor(match.positions.length / 2);
    // For even-length matches, accept both middle positions
    return match.positions.length % 2 === 0
      ? idx === mid - 1 || idx === mid
      : idx === mid;
  };

  // Helper to check if position is at either end of a line match
  const isEnd = (match: Match, row: number, col: number): boolean => {
    const idx = match.positions.findIndex(
      (p) => p.row === row && p.col === col,
    );
    return idx === 0 || idx === match.positions.length - 1;
  };

  // Helper to add a match if not already processed
  const addMatch = (
    positions: Position[],
    gemType: GemType,
    scoreMultiplier: number,
  ): void => {
    const sortedPos = positions
      .map((p) => `${p.row},${p.col}`)
      .sort()
      .join("|");
    if (!processedShapes.has(sortedPos)) {
      processedShapes.add(sortedPos);
      matches.push({
        positions,
        type: gemType,
        score: positions.length * scoreMultiplier,
      });
    }
  };

  // Check for multiple intersection patterns (++ patterns)
  // A vertical line crossing multiple horizontals
  for (const vMatch of verticalMatches) {
    const intersectingHorizontals = horizontalMatches.filter(
      (hMatch) =>
        hMatch.type === vMatch.type &&
        vMatch.positions.some((vPos) =>
          hasPosition(hMatch, vPos.row, vPos.col),
        ),
    );

    if (intersectingHorizontals.length > 1) {
      // Combine all positions from the vertical and all intersecting horizontals
      const allPositions = [
        ...vMatch.positions,
        ...intersectingHorizontals.flatMap((h) => h.positions),
      ];
      const uniquePositions = Array.from(
        new Map(allPositions.map((p) => [`${p.row}-${p.col}`, p])).values(),
      );
      addMatch(uniquePositions, vMatch.type, 300);
      continue; // Skip individual pairwise checks for this vertical
    }
  }

  // A horizontal line crossing multiple verticals
  for (const hMatch of horizontalMatches) {
    const intersectingVerticals = verticalMatches.filter(
      (vMatch) =>
        vMatch.type === hMatch.type &&
        hMatch.positions.some((hPos) =>
          hasPosition(vMatch, hPos.row, hPos.col),
        ),
    );

    if (intersectingVerticals.length > 1) {
      // Combine all positions from the horizontal and all intersecting verticals
      const allPositions = [
        ...hMatch.positions,
        ...intersectingVerticals.flatMap((v) => v.positions),
      ];
      const uniquePositions = Array.from(
        new Map(allPositions.map((p) => [`${p.row}-${p.col}`, p])).values(),
      );
      addMatch(uniquePositions, hMatch.type, 300);
      continue; // Skip individual pairwise checks for this horizontal
    }
  }

  // Check for single intersections (L, T, + shapes)
  for (const hMatch of horizontalMatches) {
    for (const vMatch of verticalMatches) {
      // Only check if same gem type
      if (hMatch.type !== vMatch.type) continue;

      // Find intersection point
      const intersection = hMatch.positions.find((hPos) =>
        hasPosition(vMatch, hPos.row, hPos.col),
      );

      if (!intersection) continue;

      const hCenter = isCenter(hMatch, intersection.row, intersection.col);
      const vCenter = isCenter(vMatch, intersection.row, intersection.col);
      const hEnd = isEnd(hMatch, intersection.row, intersection.col);
      const vEnd = isEnd(vMatch, intersection.row, intersection.col);

      const allPositions = [...hMatch.positions, ...vMatch.positions];
      const uniquePositions = Array.from(
        new Map(allPositions.map((p) => [`${p.row}-${p.col}`, p])).values(),
      );

      // +-shape: center of both lines
      if (hCenter && vCenter) {
        addMatch(uniquePositions, hMatch.type, 250);
      }
      // T-shape: center of one, end of other (|+ pattern)
      else if ((hCenter && vEnd) || (hEnd && vCenter)) {
        addMatch(uniquePositions, hMatch.type, 225);
      }
      // L-shape: end of both lines
      else if (hEnd && vEnd) {
        addMatch(uniquePositions, hMatch.type, 200);
      }
    }
  }

  return matches;
};

/**
 * Removes duplicate matches that share positions
 */
export const removeDuplicateMatches = (matches: Match[]): Match[] => {
  const uniqueMatches: Match[] = [];
  const processedPositions = new Set<string>();

  // Sort matches by score (descending) to prioritize longer matches
  const sortedMatches = [...matches].sort((a, b) => b.score - a.score);

  for (const match of sortedMatches) {
    // Check if any position in this match has already been used
    const positionKeys = match.positions.map((pos) => `${pos.row}-${pos.col}`);
    const hasOverlap = positionKeys.some((key) => processedPositions.has(key));

    if (!hasOverlap) {
      uniqueMatches.push(match);
      // Mark all positions as used
      positionKeys.forEach((key) => processedPositions.add(key));
    }
  }

  return uniqueMatches;
};

/**
 * Main function to find all matches on the board
 * Priority order (by score multiplier):
 * 1. Multiple intersections (++ patterns): 300 points/gem
 * 2. +-shapes (cross): 250 points/gem
 * 3. T-shapes (|+): 225 points/gem
 * 4. L-shapes (corner): 200 points/gem
 * 5. Rectangular matches (2x2+): 150 points/gem
 * 6. Simple lines (3+ horizontal/vertical): 100 points/gem
 */
export const findMatches = (board: (Gem | null)[][]): Match[] => {
  const complexShapeMatches = findMultipleAxisMatches(board);
  const rectangularMatches = findRectangularMatches(board);
  const horizontalMatches = findHorizontalMatches(board);
  const verticalMatches = findVerticalMatches(board);

  const allMatches = [
    ...complexShapeMatches,
    ...rectangularMatches,
    ...horizontalMatches,
    ...verticalMatches,
  ];

  return removeDuplicateMatches(allMatches);
};
