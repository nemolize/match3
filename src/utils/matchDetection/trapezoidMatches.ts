import { BOARD_SIZE } from "@/constants/game";
import type { Gem, Match, Position } from "@/types/game";

/**
 * Finds all trapezoid-shaped matches
 * Trapezoids are two adjacent rows where one row is wider than the other
 * Example patterns:
 *   xxx    xx    xxx     xx     xxx
 *   xx    xxx     xx    xxx      xx
 *  (left) (left) (ctr) (ctr) (right)
 */
export const findTrapezoidMatches = (board: (Gem | null)[][]): Match[] => {
  const matches: Match[] = [];
  const processedTrapezoids = new Set<string>();

  /**
   * Check if a trapezoid shape exists starting at the given position
   * @param startRow - Top row of the trapezoid
   * @param startCol - Left column of the wider row
   * @param wideWidth - Width of the wider row
   * @param narrowWidth - Width of the narrower row
   * @param narrowOffset - Column offset of narrower row relative to wider row
   * @param wideOnTop - If true, wider row is on top; if false, wider row is on bottom
   */
  const checkTrapezoid = (
    startRow: number,
    startCol: number,
    wideWidth: number,
    narrowWidth: number,
    narrowOffset: number,
    wideOnTop: boolean,
  ): Match | null => {
    // Check bounds
    if (startRow + 2 > BOARD_SIZE) return null;
    if (startCol + wideWidth > BOARD_SIZE) return null;
    if (startCol + narrowOffset + narrowWidth > BOARD_SIZE) return null;
    if (narrowOffset < 0) return null;

    const positions: Position[] = [];
    const wideRow = wideOnTop ? startRow : startRow + 1;
    const narrowRow = wideOnTop ? startRow + 1 : startRow;

    // Get first gem to compare type
    const firstGem = board[wideRow]?.[startCol];
    if (!firstGem) return null;
    const gemType = firstGem.type;

    // Check wider row
    for (let c = startCol; c < startCol + wideWidth; c++) {
      const gem = board[wideRow]?.[c];
      if (!gem || gem.type !== gemType) {
        return null;
      }
      positions.push({ row: wideRow, col: c });
    }

    // Check narrower row
    const narrowStartCol = startCol + narrowOffset;
    for (let c = narrowStartCol; c < narrowStartCol + narrowWidth; c++) {
      const gem = board[narrowRow]?.[c];
      if (!gem || gem.type !== gemType) {
        return null;
      }
      positions.push({ row: narrowRow, col: c });
    }

    // Create unique key for this trapezoid
    const key = `${startRow},${startCol},${wideWidth},${narrowWidth},${narrowOffset},${wideOnTop}`;
    if (processedTrapezoids.has(key)) {
      return null;
    }
    processedTrapezoids.add(key);

    // Calculate score based on total gems
    const gemCount = wideWidth + narrowWidth;
    const score = gemCount * 175; // Higher priority than rectangular matches

    return {
      positions,
      type: gemType,
      score,
    };
  };

  // Scan board for all possible trapezoid configurations
  for (let row = 0; row < BOARD_SIZE - 1; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      // 3-wide + 2-narrow trapezoids
      // Top-wide, left-aligned: xxx
      //                         xx
      const trapezoid3x2TopLeft = checkTrapezoid(row, col, 3, 2, 0, true);
      if (trapezoid3x2TopLeft) matches.push(trapezoid3x2TopLeft);

      // Top-wide, center-aligned: xxx
      //                            xx
      const trapezoid3x2TopCenter = checkTrapezoid(row, col, 3, 2, 1, true);
      if (trapezoid3x2TopCenter) matches.push(trapezoid3x2TopCenter);

      // Top-wide, right-aligned: xxx
      //                           xx
      const trapezoid3x2TopRight = checkTrapezoid(row, col, 3, 2, 1, true);
      if (trapezoid3x2TopRight) matches.push(trapezoid3x2TopRight);

      // Bottom-wide, left-aligned: xx
      //                            xxx
      const trapezoid3x2BottomLeft = checkTrapezoid(row, col, 3, 2, 0, false);
      if (trapezoid3x2BottomLeft) matches.push(trapezoid3x2BottomLeft);

      // Bottom-wide, center-aligned:  xx
      //                               xxx
      const trapezoid3x2BottomCenter = checkTrapezoid(row, col, 3, 2, 1, false);
      if (trapezoid3x2BottomCenter) matches.push(trapezoid3x2BottomCenter);

      // 4-wide + 3-narrow trapezoids
      // Top-wide, left-aligned: xxxx
      //                         xxx
      const trapezoid4x3TopLeft = checkTrapezoid(row, col, 4, 3, 0, true);
      if (trapezoid4x3TopLeft) matches.push(trapezoid4x3TopLeft);

      // Top-wide, center-aligned: xxxx
      //                            xxx
      const trapezoid4x3TopCenter = checkTrapezoid(row, col, 4, 3, 1, true);
      if (trapezoid4x3TopCenter) matches.push(trapezoid4x3TopCenter);

      // Top-wide, right-aligned: xxxx
      //                           xxx
      const trapezoid4x3TopRight = checkTrapezoid(row, col, 4, 3, 1, true);
      if (trapezoid4x3TopRight) matches.push(trapezoid4x3TopRight);

      // Bottom-wide, left-aligned: xxx
      //                            xxxx
      const trapezoid4x3BottomLeft = checkTrapezoid(row, col, 4, 3, 0, false);
      if (trapezoid4x3BottomLeft) matches.push(trapezoid4x3BottomLeft);

      // Bottom-wide, center-aligned:  xxx
      //                               xxxx
      const trapezoid4x3BottomCenter = checkTrapezoid(row, col, 4, 3, 1, false);
      if (trapezoid4x3BottomCenter) matches.push(trapezoid4x3BottomCenter);

      // 4-wide + 2-narrow trapezoids
      // Top-wide, left-aligned: xxxx
      //                         xx
      const trapezoid4x2TopLeft = checkTrapezoid(row, col, 4, 2, 0, true);
      if (trapezoid4x2TopLeft) matches.push(trapezoid4x2TopLeft);

      // Top-wide, center-aligned: xxxx
      //                            xx
      const trapezoid4x2TopCenter = checkTrapezoid(row, col, 4, 2, 1, true);
      if (trapezoid4x2TopCenter) matches.push(trapezoid4x2TopCenter);

      // Top-wide, right-aligned: xxxx
      //                            xx
      const trapezoid4x2TopRight = checkTrapezoid(row, col, 4, 2, 2, true);
      if (trapezoid4x2TopRight) matches.push(trapezoid4x2TopRight);

      // Bottom-wide, left-aligned: xx
      //                            xxxx
      const trapezoid4x2BottomLeft = checkTrapezoid(row, col, 4, 2, 0, false);
      if (trapezoid4x2BottomLeft) matches.push(trapezoid4x2BottomLeft);

      // Bottom-wide, center-aligned:  xx
      //                               xxxx
      const trapezoid4x2BottomCenter = checkTrapezoid(row, col, 4, 2, 1, false);
      if (trapezoid4x2BottomCenter) matches.push(trapezoid4x2BottomCenter);

      // Bottom-wide, right-aligned:   xx
      //                               xxxx
      const trapezoid4x2BottomRight = checkTrapezoid(row, col, 4, 2, 2, false);
      if (trapezoid4x2BottomRight) matches.push(trapezoid4x2BottomRight);
    }
  }

  return matches;
};
