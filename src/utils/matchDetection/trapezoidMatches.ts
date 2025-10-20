import { BOARD_SIZE } from "@/constants/game";
import type { Gem, Match, Position } from "@/types/game";

/**
 * Finds all trapezoid-shaped matches
 * Trapezoids can be:
 * 1. Horizontal: two adjacent rows where one row is wider than the other
 *    Example: xxx    xx    xxx     xx     xxx
 *             xx    xxx     xx    xxx      xx
 *            (left) (left) (ctr) (ctr) (right)
 *
 * 2. Vertical: three rows where the top/bottom is narrower than middle two rows
 *    Example:  x     x    xx    xx
 *             xx    xx    xx    xx
 *             xx    xx     x     x
 *            (left)(right)(left)(right)
 */
export const findTrapezoidMatches = (board: (Gem | null)[][]): Match[] => {
  const matches: Match[] = [];
  const processedTrapezoids = new Set<string>();

  /**
   * Check if a horizontal trapezoid shape exists starting at the given position
   * @param startRow - Top row of the trapezoid
   * @param startCol - Left column of the wider row
   * @param wideWidth - Width of the wider row
   * @param narrowWidth - Width of the narrower row
   * @param narrowOffset - Column offset of narrower row relative to wider row
   * @param wideOnTop - If true, wider row is on top; if false, wider row is on bottom
   */
  const checkHorizontalTrapezoid = (
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

  /**
   * Check if a vertical trapezoid shape exists starting at the given position
   * Vertical trapezoids have 3 rows where one row is narrower than the other two
   * @param startRow - Top row of the trapezoid
   * @param startCol - Left column of the trapezoid
   * @param narrowWidth - Width of the narrow row (1 or 2)
   * @param wideWidth - Width of the wide rows (2 or 3)
   * @param narrowOffset - Column offset of narrower row relative to wider rows
   * @param narrowOnTop - If true, narrow row is on top; if false, narrow row is on bottom
   */
  const checkVerticalTrapezoid = (
    startRow: number,
    startCol: number,
    narrowWidth: number,
    wideWidth: number,
    narrowOffset: number,
    narrowOnTop: boolean,
  ): Match | null => {
    // Check bounds - need 3 rows
    if (startRow + 3 > BOARD_SIZE) return null;
    if (startCol + wideWidth > BOARD_SIZE) return null;
    if (startCol + narrowOffset + narrowWidth > BOARD_SIZE) return null;
    if (narrowOffset < 0) return null;

    const positions: Position[] = [];
    const narrowRow = narrowOnTop ? startRow : startRow + 2;
    const wideRow1 = narrowOnTop ? startRow + 1 : startRow;
    const wideRow2 = narrowOnTop ? startRow + 2 : startRow + 1;

    // Get first gem to compare type
    const firstGem = board[wideRow1]?.[startCol];
    if (!firstGem) return null;
    const gemType = firstGem.type;

    // Check first wide row
    for (let c = startCol; c < startCol + wideWidth; c++) {
      const gem = board[wideRow1]?.[c];
      if (!gem || gem.type !== gemType) {
        return null;
      }
      positions.push({ row: wideRow1, col: c });
    }

    // Check second wide row
    for (let c = startCol; c < startCol + wideWidth; c++) {
      const gem = board[wideRow2]?.[c];
      if (!gem || gem.type !== gemType) {
        return null;
      }
      positions.push({ row: wideRow2, col: c });
    }

    // Check narrow row
    const narrowStartCol = startCol + narrowOffset;
    for (let c = narrowStartCol; c < narrowStartCol + narrowWidth; c++) {
      const gem = board[narrowRow]?.[c];
      if (!gem || gem.type !== gemType) {
        return null;
      }
      positions.push({ row: narrowRow, col: c });
    }

    // Create unique key for this trapezoid
    const key = `v-${startRow},${startCol},${narrowWidth},${wideWidth},${narrowOffset},${narrowOnTop}`;
    if (processedTrapezoids.has(key)) {
      return null;
    }
    processedTrapezoids.add(key);

    // Calculate score based on total gems
    const gemCount = wideWidth * 2 + narrowWidth;
    const score = gemCount * 175; // Same as horizontal trapezoids

    return {
      positions,
      type: gemType,
      score,
    };
  };

  // Scan board for all possible trapezoid configurations
  for (let row = 0; row < BOARD_SIZE - 1; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      // HORIZONTAL TRAPEZOIDS (2 rows)
      // 3-wide + 2-narrow trapezoids
      // Top-wide, left-aligned: xxx
      //                         xx
      const trapezoid3x2TopLeft = checkHorizontalTrapezoid(
        row,
        col,
        3,
        2,
        0,
        true,
      );
      if (trapezoid3x2TopLeft) matches.push(trapezoid3x2TopLeft);

      // Top-wide, center-aligned: xxx
      //                            xx
      const trapezoid3x2TopCenter = checkHorizontalTrapezoid(
        row,
        col,
        3,
        2,
        1,
        true,
      );
      if (trapezoid3x2TopCenter) matches.push(trapezoid3x2TopCenter);

      // Top-wide, right-aligned: xxx
      //                           xx
      const trapezoid3x2TopRight = checkHorizontalTrapezoid(
        row,
        col,
        3,
        2,
        1,
        true,
      );
      if (trapezoid3x2TopRight) matches.push(trapezoid3x2TopRight);

      // Bottom-wide, left-aligned: xx
      //                            xxx
      const trapezoid3x2BottomLeft = checkHorizontalTrapezoid(
        row,
        col,
        3,
        2,
        0,
        false,
      );
      if (trapezoid3x2BottomLeft) matches.push(trapezoid3x2BottomLeft);

      // Bottom-wide, center-aligned:  xx
      //                               xxx
      const trapezoid3x2BottomCenter = checkHorizontalTrapezoid(
        row,
        col,
        3,
        2,
        1,
        false,
      );
      if (trapezoid3x2BottomCenter) matches.push(trapezoid3x2BottomCenter);

      // 4-wide + 3-narrow trapezoids
      // Top-wide, left-aligned: xxxx
      //                         xxx
      const trapezoid4x3TopLeft = checkHorizontalTrapezoid(
        row,
        col,
        4,
        3,
        0,
        true,
      );
      if (trapezoid4x3TopLeft) matches.push(trapezoid4x3TopLeft);

      // Top-wide, center-aligned: xxxx
      //                            xxx
      const trapezoid4x3TopCenter = checkHorizontalTrapezoid(
        row,
        col,
        4,
        3,
        1,
        true,
      );
      if (trapezoid4x3TopCenter) matches.push(trapezoid4x3TopCenter);

      // Top-wide, right-aligned: xxxx
      //                           xxx
      const trapezoid4x3TopRight = checkHorizontalTrapezoid(
        row,
        col,
        4,
        3,
        1,
        true,
      );
      if (trapezoid4x3TopRight) matches.push(trapezoid4x3TopRight);

      // Bottom-wide, left-aligned: xxx
      //                            xxxx
      const trapezoid4x3BottomLeft = checkHorizontalTrapezoid(
        row,
        col,
        4,
        3,
        0,
        false,
      );
      if (trapezoid4x3BottomLeft) matches.push(trapezoid4x3BottomLeft);

      // Bottom-wide, center-aligned:  xxx
      //                               xxxx
      const trapezoid4x3BottomCenter = checkHorizontalTrapezoid(
        row,
        col,
        4,
        3,
        1,
        false,
      );
      if (trapezoid4x3BottomCenter) matches.push(trapezoid4x3BottomCenter);

      // 4-wide + 2-narrow trapezoids
      // Top-wide, left-aligned: xxxx
      //                         xx
      const trapezoid4x2TopLeft = checkHorizontalTrapezoid(
        row,
        col,
        4,
        2,
        0,
        true,
      );
      if (trapezoid4x2TopLeft) matches.push(trapezoid4x2TopLeft);

      // Top-wide, center-aligned: xxxx
      //                            xx
      const trapezoid4x2TopCenter = checkHorizontalTrapezoid(
        row,
        col,
        4,
        2,
        1,
        true,
      );
      if (trapezoid4x2TopCenter) matches.push(trapezoid4x2TopCenter);

      // Top-wide, right-aligned: xxxx
      //                            xx
      const trapezoid4x2TopRight = checkHorizontalTrapezoid(
        row,
        col,
        4,
        2,
        2,
        true,
      );
      if (trapezoid4x2TopRight) matches.push(trapezoid4x2TopRight);

      // Bottom-wide, left-aligned: xx
      //                            xxxx
      const trapezoid4x2BottomLeft = checkHorizontalTrapezoid(
        row,
        col,
        4,
        2,
        0,
        false,
      );
      if (trapezoid4x2BottomLeft) matches.push(trapezoid4x2BottomLeft);

      // Bottom-wide, center-aligned:  xx
      //                               xxxx
      const trapezoid4x2BottomCenter = checkHorizontalTrapezoid(
        row,
        col,
        4,
        2,
        1,
        false,
      );
      if (trapezoid4x2BottomCenter) matches.push(trapezoid4x2BottomCenter);

      // Bottom-wide, right-aligned:   xx
      //                               xxxx
      const trapezoid4x2BottomRight = checkHorizontalTrapezoid(
        row,
        col,
        4,
        2,
        2,
        false,
      );
      if (trapezoid4x2BottomRight) matches.push(trapezoid4x2BottomRight);
    }
  }

  // Scan for vertical trapezoids (3 rows)
  for (let row = 0; row < BOARD_SIZE - 2; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      // VERTICAL TRAPEZOIDS
      // 1-narrow on top, 2-wide on bottom (left-aligned)
      //  x
      // xx
      // xx
      const v1x2TopLeft = checkVerticalTrapezoid(row, col, 1, 2, 0, true);
      if (v1x2TopLeft) matches.push(v1x2TopLeft);

      // 1-narrow on top, 2-wide on bottom (right-aligned)
      //  x
      // xx
      // xx
      const v1x2TopRight = checkVerticalTrapezoid(row, col, 1, 2, 1, true);
      if (v1x2TopRight) matches.push(v1x2TopRight);

      // 1-narrow on bottom, 2-wide on top (left-aligned)
      // xx
      // xx
      //  x
      const v1x2BottomLeft = checkVerticalTrapezoid(row, col, 1, 2, 0, false);
      if (v1x2BottomLeft) matches.push(v1x2BottomLeft);

      // 1-narrow on bottom, 2-wide on top (right-aligned)
      // xx
      // xx
      //  x
      const v1x2BottomRight = checkVerticalTrapezoid(row, col, 1, 2, 1, false);
      if (v1x2BottomRight) matches.push(v1x2BottomRight);

      // 2-narrow on top, 3-wide on bottom (left-aligned)
      //  xx
      // xxx
      // xxx
      const v2x3TopLeft = checkVerticalTrapezoid(row, col, 2, 3, 0, true);
      if (v2x3TopLeft) matches.push(v2x3TopLeft);

      // 2-narrow on top, 3-wide on bottom (right-aligned)
      //   xx
      // xxx
      // xxx
      const v2x3TopRight = checkVerticalTrapezoid(row, col, 2, 3, 1, true);
      if (v2x3TopRight) matches.push(v2x3TopRight);

      // 2-narrow on bottom, 3-wide on top (left-aligned)
      // xxx
      // xxx
      //  xx
      const v2x3BottomLeft = checkVerticalTrapezoid(row, col, 2, 3, 0, false);
      if (v2x3BottomLeft) matches.push(v2x3BottomLeft);

      // 2-narrow on bottom, 3-wide on top (right-aligned)
      // xxx
      // xxx
      //   xx
      const v2x3BottomRight = checkVerticalTrapezoid(row, col, 2, 3, 1, false);
      if (v2x3BottomRight) matches.push(v2x3BottomRight);
    }
  }

  return matches;
};
