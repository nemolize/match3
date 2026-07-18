import { useGesture } from "@use-gesture/react";
import { motion } from "motion/react";
import { useCallback, useRef } from "react";

import { BoardCell } from "@/components/BoardCell";
import { BreakingGemsLayer } from "@/components/BreakingGemsLayer";
import { BOARD_GAP_REM, BOARD_SIZE, SWIPE_THRESHOLD } from "@/constants/game";
import type { AnimationPhase, Gem, Match, Position } from "@/types/game";
import { computeParticleOrigin } from "@/utils/boardLayout";

interface GameBoardProps {
  board: (Gem | null)[][];
  matches: Match[];
  selectedGem: Position | null;
  animationPhase: AnimationPhase;
  onSwipe: (from: Position, to: Position) => void;
  onGemTap: (position: Position) => void;
  isAnimating: boolean;
}

export const GameBoard = ({
  board,
  matches,
  selectedGem,
  animationPhase,
  onSwipe,
  onGemTap,
  isAnimating,
}: GameBoardProps) => {
  const boardRef = useRef<HTMLDivElement>(null);

  // GameBoard owns the ref, so it also owns the DOM measurement. The
  // particle layer receives ready-to-use spawn origins and never has to
  // know how the grid is laid out.
  const resolveParticleOrigin = useCallback((row: number, col: number) => {
    const el = boardRef.current;
    if (!el) return null;
    return computeParticleOrigin(el, row, col);
  }, []);

  const bind = useGesture(
    {
      // NOTE: BoardCell is memoized on (gem, isSelected, isAnimating)
      // and excludes `bind` from its comparator (see
      // BoardCell.tsx for the full invariant list). If you make this
      // handler read any other prop of GameBoard (e.g. `board`, `matches`),
      // you MUST also add that prop to BoardCell's comparator, or memoized
      // cells will hold a stale handler.
      onDrag: ({ args, movement: [mx, my], tap, last, canceled, cancel }) => {
        // `cancel()` immediately below fires the swipe mid-drag and asks
        // use-gesture to stop the gesture, but the browser still emits a
        // pointerup for the original press. use-gesture delivers that
        // pointerup as a deferred `onDrag` call with `canceled: true` —
        // if we didn't bail here the swipe would fire twice.
        if (isAnimating || canceled) return;

        if (!Array.isArray(args) || args.length !== 2) return;
        const [row, col] = args;
        if (typeof row !== "number" || typeof col !== "number") return;
        const from = { row, col };

        // A tap (press + release without crossing use-gesture's own
        // filterTaps threshold) is a selection intent, not a swipe.
        if (tap) {
          onGemTap(from);
          return;
        }

        const absMx = Math.abs(mx);
        const absMy = Math.abs(my);
        if (absMx < SWIPE_THRESHOLD && absMy < SWIPE_THRESHOLD) return;

        // Pick the dominant axis and step one cell in that direction
        const to: Position =
          absMx > absMy
            ? { row, col: col + (mx > 0 ? 1 : -1) }
            : { row: row + (my > 0 ? 1 : -1), col };

        // Fire as soon as the threshold is crossed mid-drag — no need to
        // wait for the finger to lift. Cancel the rest of the gesture so
        // the swipe can't fire twice.
        if (!last) cancel();

        if (
          to.row >= 0 &&
          to.row < BOARD_SIZE &&
          to.col >= 0 &&
          to.col < BOARD_SIZE
        ) {
          onSwipe(from, to);
        }
      },
    },
    { drag: { filterTaps: true } },
  );

  return (
    <motion.div
      className="relative rounded-2xl bg-gray-800 p-2 shadow-2xl sm:p-4"
      initial={{ opacity: 0, scale: 0.92, rotateX: 12 }}
      animate={{ opacity: 1, scale: 1, rotateX: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
    >
      <div
        ref={boardRef}
        aria-colcount={BOARD_SIZE}
        aria-rowcount={BOARD_SIZE}
        className="mx-auto grid aspect-square w-full max-w-sm overflow-hidden"
        role="grid"
        style={{
          gap: `${BOARD_GAP_REM}rem`,
          gridTemplateColumns: `repeat(${BOARD_SIZE}, 1fr)`,
        }}
      >
        {board.map((row, rowIndex) =>
          row.map((gem, colIndex) => (
            <BoardCell
              key={`${rowIndex}-${colIndex}`}
              gem={gem}
              rowIndex={rowIndex}
              colIndex={colIndex}
              isSelected={
                selectedGem?.row === rowIndex && selectedGem?.col === colIndex
              }
              isAnimating={isAnimating}
              animationPhase={animationPhase}
              bind={bind}
              onActivate={onGemTap}
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
    </motion.div>
  );
};
