import { useGesture } from "@use-gesture/react";
import { GemComponent } from "@/components/GemComponent";
import { BOARD_SIZE, SWIPE_THRESHOLD } from "@/constants/game";
import type { Gem, Match, Position } from "@/types/game";

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
  const matchedPositions = new Set(
    matches.flatMap((match) =>
      match.positions.map((pos) => `${pos.row}-${pos.col}`),
    ),
  );

  const bind = useGesture({
    onDrag: ({ args, movement: [mx, my], last }) => {
      if (isAnimating || !last) return;

      const [row, col] = args as [number, number];
      const from = { row, col };

      // Calculate swipe direction
      const absMx = Math.abs(mx);
      const absMy = Math.abs(my);

      if (absMx < SWIPE_THRESHOLD && absMy < SWIPE_THRESHOLD) {
        // Movement too small, ignore
        return;
      }

      let to: Position;

      if (absMx > absMy) {
        // Horizontal swipe
        to = { row, col: col + (mx > 0 ? 1 : -1) };
      } else {
        // Vertical swipe
        to = { row: row + (my > 0 ? 1 : -1), col };
      }

      // Check bounds
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
    <div className="relative bg-gray-800 rounded-2xl p-4 shadow-2xl">
      {/* Board grid */}
      <div
        className="grid grid-cols-8 gap-1 aspect-square w-full max-w-sm mx-auto"
        style={{ gridTemplateColumns: `repeat(${BOARD_SIZE}, 1fr)` }}
      >
        {board.map((row, rowIndex) =>
          row.map((gem, colIndex) => (
            <div
              key={gem ? `gem-${gem.id}` : `empty-${rowIndex}-${colIndex}`}
              className="aspect-square bg-gray-700 rounded-lg p-1"
            >
              {gem && (
                <div
                  {...bind(rowIndex, colIndex)}
                  className="w-full h-full touch-none"
                  style={{ touchAction: "none" }}
                >
                  <GemComponent
                    gem={gem}
                    isSelected={false}
                    isMatched={matchedPositions.has(`${rowIndex}-${colIndex}`)}
                    onClick={() => {}}
                  />
                </div>
              )}
            </div>
          )),
        )}
      </div>

      {/* Animation overlay */}
      {isAnimating && (
        <div className="absolute inset-0 bg-black/10 rounded-2xl transition-opacity duration-200" />
      )}
    </div>
  );
};
