import type { Gem, GemType, Match, Position } from "@/types/game";

import { findHorizontalMatches, findVerticalMatches } from "./lineMatches";

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
