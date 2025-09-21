import { useGesture } from "@use-gesture/react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo } from "react";

import { GemComponent } from "@/components/GemComponent";
import { BOARD_SIZE, SWIPE_THRESHOLD } from "@/constants/game";
import type { Gem, Match, Position } from "@/types/game";

interface GameBoardProps {
  board: (Gem | null)[][];
  matches: Match[];
  onSwipe: (from: Position, to: Position) => void;
  isAnimating: boolean;
}

const gemSpring = {
  type: "spring" as const,
  stiffness: 420,
  damping: 32,
  mass: 0.6,
};

export const GameBoard = ({
  board,
  matches,
  onSwipe,
  isAnimating,
}: GameBoardProps) => {
  const matchedPositions = useMemo(
    () =>
      new Set(
        matches.flatMap((match) =>
          match.positions.map((pos) => `${pos.row}-${pos.col}`),
        ),
      ),
    [matches],
  );

  const bind = useGesture({
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
      <motion.div
        className="mx-auto grid aspect-square w-full max-w-sm gap-1"
        style={{ gridTemplateColumns: `repeat(${BOARD_SIZE}, 1fr)` }}
        layout
        transition={{ type: "spring", stiffness: 260, damping: 28 }}
      >
        {board.map((row, rowIndex) =>
          row.map((gem, colIndex) => {
            const positionKey = `${rowIndex}-${colIndex}`;
            const isMatched = matchedPositions.has(positionKey);
            const gestureHandlers = bind(rowIndex, colIndex);

            return (
              <motion.div
                key={positionKey}
                className="aspect-square rounded-lg bg-gray-700/80 p-1"
                layout
                transition={{ type: "spring", stiffness: 260, damping: 28 }}
                whileHover={{ scale: 1.02 }}
              >
                <AnimatePresence mode="popLayout">
                  {gem && (
                    <div
                      {...gestureHandlers}
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
                        <GemComponent
                          gem={gem}
                          isSelected={false}
                          isMatched={isMatched}
                          onClick={() => {}}
                        />
                      </motion.div>
                    </div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          }),
        )}
      </motion.div>

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
