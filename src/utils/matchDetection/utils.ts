import type { Match } from "@/types/game";

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
