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
 */
export const findMatches = (board: (Gem | null)[][]): Match[] => {
  const horizontalMatches = findHorizontalMatches(board);
  const verticalMatches = findVerticalMatches(board);
  const allMatches = [...horizontalMatches, ...verticalMatches];

  return removeDuplicateMatches(allMatches);
};
