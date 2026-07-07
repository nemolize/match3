import { useGesture } from "@use-gesture/react";
import { AnimatePresence, motion } from "motion/react";
import {
  memo,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { GemComponent } from "@/components/GemComponent";
import { GemParticles } from "@/components/GemParticles";
import { BOARD_SIZE, SWIPE_THRESHOLD } from "@/constants/game";
import type { Gem, GemType, Match, Position } from "@/types/game";

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

const noop = () => {};

type BindFn = ReturnType<typeof useGesture>;

interface BoardCellProps {
  gem: Gem | null;
  rowIndex: number;
  colIndex: number;
  isMatched: boolean;
  isAnimating: boolean;
  bind: BindFn;
}

const BoardCell = memo(
  function BoardCell({
    gem,
    rowIndex,
    colIndex,
    isMatched,
    isAnimating,
    bind,
  }: BoardCellProps) {
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
  },
  // `bind` is deliberately excluded: use-gesture recreates the bind function
  // every render, but the returned handlers delegate to a controller that is
  // stable for the lifetime of the hook, so a memoized cell keeps working
  // with the handlers it already rendered.
  (prev, next) =>
    prev.gem === next.gem &&
    prev.isMatched === next.isMatched &&
    prev.isAnimating === next.isAnimating,
);

interface BreakingGem {
  id: string;
  type: GemType;
  x: number;
  y: number;
  size: number;
}

interface BreakingGemsLayerProps {
  board: (Gem | null)[][];
  matches: Match[];
  boardRef: RefObject<HTMLDivElement | null>;
}

/**
 * Owns the breaking-gem particle effects. Isolating this state from the
 * grid means per-particle spawn/complete updates re-render only this layer,
 * not the 64 board cells.
 */
const BreakingGemsLayer = ({
  board,
  matches,
  boardRef,
}: BreakingGemsLayerProps) => {
  const [breakingGems, setBreakingGems] = useState<BreakingGem[]>([]);
  const prevMatchesRef = useRef<Match[]>([]);

  // Detect new matches and create breaking gem particles
  useEffect(() => {
    const boardElement = boardRef.current;
    if (!boardElement) return;

    // Check if we have new matches
    const newMatchPositions = matches.flatMap((match) => match.positions);
    const prevMatchPositions = prevMatchesRef.current.flatMap(
      (match) => match.positions,
    );

    const hasNewMatches =
      newMatchPositions.length > 0 &&
      (prevMatchPositions.length !== newMatchPositions.length ||
        !newMatchPositions.every((pos, i) =>
          prevMatchPositions[i]
            ? pos.row === prevMatchPositions[i].row &&
              pos.col === prevMatchPositions[i].col
            : false,
        ));

    if (hasNewMatches) {
      const boardRect = boardElement.getBoundingClientRect();

      // Get the actual gap size from computed styles
      const boardStyle = window.getComputedStyle(boardElement);
      const gapSize = parseFloat(boardStyle.gap) || 0;

      // Calculate actual cell size accounting for gaps
      const actualCellSize =
        (boardRect.width - gapSize * (BOARD_SIZE - 1)) / BOARD_SIZE;

      // Get the board's offset from its parent (accounts for p-4 padding on parent)
      const boardOffsetLeft = boardElement.offsetLeft;
      const boardOffsetTop = boardElement.offsetTop;

      // Cell padding (p-1 = 4px)
      const cellPadding = 4;

      const newBreakingGems: BreakingGem[] = [];

      matches.forEach((match) => {
        match.positions.forEach((pos) => {
          const gem = board[pos.row]?.[pos.col];
          if (gem) {
            // Calculate pixel position relative to the parent container
            // accounting for: board offset, grid gaps, and cell padding
            const x = boardOffsetLeft + pos.col * (actualCellSize + gapSize);
            const y = boardOffsetTop + pos.row * (actualCellSize + gapSize);

            // Size is cell size minus padding on both sides
            const gemSize = actualCellSize - cellPadding * 2;

            newBreakingGems.push({
              id: `breaking-${gem.id}-${Date.now()}`,
              type: gem.type,
              x,
              y,
              size: gemSize,
            });
          }
        });
      });

      // Use setTimeout to avoid calling setState synchronously in effect
      setTimeout(() => {
        setBreakingGems((prev) => [...prev, ...newBreakingGems]);
      }, 0);
    }

    prevMatchesRef.current = matches;
  }, [matches, board, boardRef]);

  const handleParticleComplete = useCallback((id: string) => {
    setBreakingGems((prev) => prev.filter((gem) => gem.id !== id));
  }, []);

  return (
    <>
      {breakingGems.map((breakingGem) => (
        <GemParticles
          key={breakingGem.id}
          id={breakingGem.id}
          gemType={breakingGem.type}
          x={breakingGem.x}
          y={breakingGem.y}
          size={breakingGem.size}
          onComplete={handleParticleComplete}
        />
      ))}
    </>
  );
};

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
      <BreakingGemsLayer board={board} matches={matches} boardRef={boardRef} />

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
