import { BOARD_SIZE } from "@/constants/game";

/**
 * Layout constants that mirror the Tailwind classes GameBoard applies to
 * the grid element. Keeping them here — instead of magic numbers scattered
 * across components — is what lets particle spawn positions be computed
 * without reading the surrounding JSX shape.
 *
 * If the class on the cell wrapper changes (e.g. `p-1` → `p-2`), update
 * `cellPaddingPx` in step.
 */
export const LAYOUT = {
  /** Padding inside every cell wrapper (Tailwind `p-1`). */
  cellPaddingPx: 4,
} as const;

export interface ParticleOrigin {
  /** Top-left x of the gem relative to the board's parent, in pixels. */
  x: number;
  /** Top-left y of the gem relative to the board's parent, in pixels. */
  y: number;
  /** Rendered gem edge length, in pixels. */
  size: number;
}

/**
 * Given the board's rendered grid element, compute the spawn origin of a
 * particle burst for the gem at (row, col). Reads the element's current
 * width and computed grid-gap so the caller never has to know either.
 */
export const computeParticleOrigin = (
  boardElement: HTMLElement,
  row: number,
  col: number,
): ParticleOrigin => {
  const boardRect = boardElement.getBoundingClientRect();
  const boardStyle = window.getComputedStyle(boardElement);
  const gapSize = parseFloat(boardStyle.gap) || 0;

  // Cell size = (full width − total gap between cells) / cell count
  const cellSize = (boardRect.width - gapSize * (BOARD_SIZE - 1)) / BOARD_SIZE;

  const cellPadding = LAYOUT.cellPaddingPx;

  return {
    x: boardElement.offsetLeft + col * (cellSize + gapSize),
    y: boardElement.offsetTop + row * (cellSize + gapSize),
    size: cellSize - cellPadding * 2,
  };
};
