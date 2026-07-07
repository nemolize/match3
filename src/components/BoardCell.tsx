import type { useGesture } from "@use-gesture/react";
import { AnimatePresence, motion } from "motion/react";
import { memo } from "react";

import { GemComponent } from "@/components/GemComponent";
import type { Gem } from "@/types/game";

/**
 * The `useGesture` return type: given a cell's (row, col) it produces the
 * event-handler bag we spread onto the drag target. `use-gesture` recreates
 * this binder every render but the returned handlers delegate to a
 * controller whose identity is stable for the lifetime of the hook — see
 * the comparator below.
 */
export type CellBindFn = ReturnType<typeof useGesture>;

const gemSpring = {
  type: "spring" as const,
  stiffness: 420,
  damping: 32,
  mass: 0.6,
};

const noop = () => {};

export interface BoardCellProps {
  gem: Gem | null;
  rowIndex: number;
  colIndex: number;
  isMatched: boolean;
  isAnimating: boolean;
  bind: CellBindFn;
}

const BoardCellImpl = ({
  gem,
  rowIndex,
  colIndex,
  isMatched,
  isAnimating,
  bind,
}: BoardCellProps) => {
  return (
    <div
      aria-colindex={colIndex + 1}
      aria-rowindex={rowIndex + 1}
      className="aspect-square rounded-lg bg-gray-700/80 p-1"
      role="gridcell"
    >
      <AnimatePresence mode="popLayout">
        {gem && (
          <div
            {...bind(rowIndex, colIndex)}
            className="h-full w-full touch-none"
            style={{ touchAction: "none" }}
          >
            <motion.div
              key={gem.id}
              className="h-full w-full"
              layout
              layoutId={`gem-${gem.id}`}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{
                scale: isMatched ? 0.6 : 1,
                opacity: isMatched ? 0.25 : 1,
                rotateX: isMatched ? 18 : 0,
              }}
              exit={{ scale: 0.4, opacity: 0 }}
              transition={gemSpring}
              whileHover={isAnimating ? undefined : { scale: 1.05 }}
              whileTap={isAnimating ? undefined : { scale: 0.95 }}
            >
              <GemComponent gem={gem} isSelected={false} onClick={noop} />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

/**
 * Memoized so a re-render of `GameBoard` (e.g. `BreakingGemsLayer` state
 * change) does NOT re-render 64 cells.
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
 * 3. If you add a new prop to `BoardCellProps` that affects the rendered
 *    output, add it to the comparator too.
 */
export const BoardCell = memo(
  BoardCellImpl,
  (prev, next) =>
    prev.gem === next.gem &&
    prev.isMatched === next.isMatched &&
    prev.isAnimating === next.isAnimating,
);
