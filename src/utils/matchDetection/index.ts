import type { Gem, Match } from "@/types/game";

import { findHorizontalMatches, findVerticalMatches } from "./lineMatches";
import { findMultipleAxisMatches } from "./multiAxisMatches";
import { findRectangularMatches } from "./rectangularMatches";
import { findTrapezoidMatches } from "./trapezoidMatches";
import { removeDuplicateMatches } from "./utils";

// Re-export all functions
export { findHorizontalMatches, findVerticalMatches } from "./lineMatches";
export { findMultipleAxisMatches } from "./multiAxisMatches";
export { findRectangularMatches } from "./rectangularMatches";
export { findTrapezoidMatches } from "./trapezoidMatches";
export { removeDuplicateMatches } from "./utils";

/**
 * Main function to find all matches on the board
 * Priority order (by score multiplier):
 * 1. Multiple intersections (++ patterns): 300 points/gem
 * 2. +-shapes (cross): 250 points/gem
 * 3. T-shapes (|+): 225 points/gem
 * 4. L-shapes (corner): 200 points/gem
 * 5. Trapezoid shapes (e.g., xxx/xx): 175 points/gem
 * 6. Rectangular matches (2x2+): 150 points/gem
 * 7. Simple lines (3+ horizontal/vertical): 100 points/gem
 */
export const findMatches = (board: (Gem | null)[][]): Match[] => {
  const complexShapeMatches = findMultipleAxisMatches(board);
  const trapezoidMatches = findTrapezoidMatches(board);
  const rectangularMatches = findRectangularMatches(board);
  const horizontalMatches = findHorizontalMatches(board);
  const verticalMatches = findVerticalMatches(board);

  const allMatches = [
    ...complexShapeMatches,
    ...trapezoidMatches,
    ...rectangularMatches,
    ...horizontalMatches,
    ...verticalMatches,
  ];

  return removeDuplicateMatches(allMatches);
};
