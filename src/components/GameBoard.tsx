import { useGesture } from "@use-gesture/react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useMemo, useRef } from "react";

import { BoardCell } from "@/components/BoardCell";
import { BreakingGemsLayer } from "@/components/BreakingGemsLayer";
import { BOARD_SIZE, SWIPE_THRESHOLD } from "@/constants/game";
import type { Gem, Match, Position } from "@/types/game";
import { computeParticleOrigin } from "@/utils/boardLayout";

interface GameBoardProps {
  board: (Gem | null)[][];
  matches: Match[];
  onSwipe: (from: Position, to: Position) => void;
  isAnimating: boolean;
}

export const GameBoard = ({
  board,
  matches,
  onSwipe,
  isAnimating,
}: GameBoardProps) => {
  const boardRef = useRef<HTMLDivElement>(null);

  const matchedPositions = useMemo(
    () =>
      new Set(
        matches.flatMap((match) =>
          match.positions.map((pos) => `${pos.row}-${pos.col}`),
        ),
      ),
    [matches],
  );

  // GameBoard owns the ref, so it also owns the DOM measurement. The
  // particle layer receives ready-to-use spawn origins and never has to
  // know how the grid is laid out.
  const resolveParticleOrigin = useCallback((row: number, col: number) => {
    const el = boardRef.current;
    if (!el) return null;
    return computeParticleOrigin(el, row, col);
  }, []);

  const bind = useGesture({
    // NOTE: BoardCell is memoized on (gem, isMatched, isAnimating) and
    // excludes `bind` from its comparator (see BoardCell.tsx for the full
    // invariant list). If you make this handler read any other prop of
    // GameBoard (e.g. `board`, `matches`), you MUST also add that prop to
    // BoardCell's comparator, or memoized cells will hold a stale handler.
    onDrag: ({ args, movement: [mx, my], last }) => {
      if (isAnimating || !last) return;

      if (!Array.isArray(args) || args.length !== 2) return;
      const [row, col] = args;
      if (typeof row !== "number" || typeof col !== "number") return;
      const from = { row, col };

      const absMx = Math.abs(mx);
      const absMy = Math.abs(my);

      if (absMx < SWIPE_THRESHOLD && absMy < SWIPE_THRESHOLD) {
        return;
      }

      let to: Position;

      if (absMx > absMy) {
        to = { row, col: col + (mx > 0 ? 1 : -1) };
      } else {
        to = { row: row + (my > 0 ? 1 : -1), col };
      }

      if (
        to.row >= 0 &&
        to.row < BOARD_SIZE &&
        to.col >= 0 &&
        to.col < BOARD_SIZE
      ) {
        onSwipe(from, to);
      }
    },
  });

  return (
    <motion.div
      className="relative rounded-2xl bg-gray-800 p-4 shadow-2xl"
      initial={{ opacity: 0, scale: 0.92, rotateX: 12 }}
      animate={{ opacity: 1, scale: 1, rotateX: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
    >
      <div
        ref={boardRef}
        aria-colcount={BOARD_SIZE}
        aria-rowcount={BOARD_SIZE}
        className="mx-auto grid aspect-square w-full max-w-sm gap-1"
        role="grid"
        style={{ gridTemplateColumns: `repeat(${BOARD_SIZE}, 1fr)` }}
      >
        {board.map((row, rowIndex) =>
          row.map((gem, colIndex) => (
            <BoardCell
              key={`${rowIndex}-${colIndex}`}
              gem={gem}
              rowIndex={rowIndex}
              colIndex={colIndex}
              isMatched={matchedPositions.has(`${rowIndex}-${colIndex}`)}
              isAnimating={isAnimating}
              bind={bind}
            />
          )),
        )}
      </div>

      {/* Particle effects for breaking gems */}
      <BreakingGemsLayer
        board={board}
        matches={matches}
        resolveOrigin={resolveParticleOrigin}
      />

      <AnimatePresence>
        {isAnimating && (
          <motion.div
            className="absolute inset-0 rounded-2xl bg-black/20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
};
