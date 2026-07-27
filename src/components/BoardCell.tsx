import type { useGesture } from "@use-gesture/react";
import { memo } from "react";

import { GemComponent } from "@/components/GemComponent";
import { GEM_CELL_PADDING_PX } from "@/constants/game";
import type { Gem, Position } from "@/types/game";

/**
 * The `useGesture` return type: given a cell's (row, col) it produces the
 * event-handler bag we spread onto the drag target. `use-gesture` recreates
 * this binder every render but the returned handlers delegate to a
 * controller whose identity is stable for the lifetime of the hook — see
 * the comparator below.
 */
export type CellBindFn = ReturnType<typeof useGesture>;

export interface BoardCellProps {
  gem: Gem | null;
  rowIndex: number;
  colIndex: number;
  isSelected: boolean;
  isAnimating: boolean;
  bind: CellBindFn;
  /**
   * Fires for keyboard activation only. Pointer taps are routed through
   * GameBoard's gesture `bind` (see the `filterTaps` config + the `tap`
   * branch in its `onDrag`), and GemComponent's `handleClick` gates on
   * `event.detail === 0` so only keyboard-driven synthetic clicks reach
   * here. Wiring a mouse-click path in would double-fire with the
   * gesture layer.
   *
   * IMPORTANT: `onActivate` is deliberately excluded from the memo
   * comparator below, so this callback's closure identity may lag the
   * parent by an arbitrary number of renders. Any state it reads MUST
   * be read via a ref (see `gameStateRef` in `useMatch3Game`).
   */
  onActivate: (position: Position) => void;
}

const BoardCellImpl = ({
  gem,
  rowIndex,
  colIndex,
  isSelected,
  bind,
  onActivate,
}: BoardCellProps) => {
  return (
    <div
      aria-colindex={colIndex + 1}
      aria-rowindex={rowIndex + 1}
      className="aspect-square"
      role="gridcell"
    >
      {gem && (
        <div
          {...bind(rowIndex, colIndex)}
          className="h-full w-full touch-none"
          style={{ padding: GEM_CELL_PADDING_PX, touchAction: "none" }}
        >
          <GemComponent
            gem={gem}
            isSelected={isSelected}
            onActivate={() => onActivate({ row: rowIndex, col: colIndex })}
          />
        </div>
      )}
    </div>
  );
};

/**
 * Memoized so renderer status and workload updates do not re-render 64 cells.
 *
 * **Invariants the comparator relies on — read before extending this cell:**
 *
 * 1. Every value that `onDrag` in `GameBoard` closes over MUST be listed in
 *    the comparator below, because `bind` is deliberately *not* compared
 *    for identity (it changes every render). Today `onDrag` reads
 *    `isAnimating` only; adding a read of e.g. `board` or `matches` here
 *    without also adding those to the comparator would silently keep a
 *    stale handler.
 * 2. `use-gesture` (currently v10.x) is assumed to keep the returned
 *    handlers stable — internally they delegate to a controller that
 *    mutates in place across renders. If a major bump breaks this
 *    invariant, cells will hold stale handlers; regenerate `bind` per
 *    cell instead of memoizing it.
 * 3. `onActivate` is also excluded from comparison, so the closure this
 *    cell holds MAY be several renders stale by the time the user hits
 *    Enter/Space on it. The callback provider (`useMatch3Game`
 *    `handleGemTap`) therefore reads all game state through a ref —
 *    never through its own closure — so a stale identity still observes
 *    fresh state. If a future feature needs `onActivate` to reflect
 *    something that IS closed over, add that to the comparator instead
 *    (or route through a ref on the provider side).
 * 4. Any new prop added to `BoardCellProps` that affects the rendered
 *    output MUST be added to the comparator.
 */
export const BoardCell = memo(
  BoardCellImpl,
  (prev, next) =>
    prev.gem === next.gem &&
    prev.isSelected === next.isSelected &&
    prev.isAnimating === next.isAnimating,
);
