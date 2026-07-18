import "@/styles/globals.css";

import { MotionConfig } from "motion/react";
import { useState } from "react";
import { createRoot } from "react-dom/client";

import { GameBoard } from "@/components/GameBoard";
import { BOARD_SIZE } from "@/constants/game";
import type { AnimationPhase, Gem } from "@/types/game";

const createBoard = (): (Gem | null)[][] =>
  Array.from({ length: BOARD_SIZE }, () =>
    Array<Gem | null>(BOARD_SIZE).fill(null),
  );

const createGem = (id: string, row: number): Gem => ({
  id,
  type: "red",
  position: { row, col: 0 },
});

const initialBoard = createBoard();
for (let row = 3; row < BOARD_SIZE; row++) {
  const boardRow = initialBoard[row];
  if (boardRow) boardRow[0] = createGem(`existing-${row}`, row);
}

const droppedBoard = initialBoard.map((row) => [...row]);
for (let row = 0; row < 3; row++) {
  const boardRow = droppedBoard[row];
  if (boardRow) {
    boardRow[0] = {
      ...createGem(`refill-${row}`, row),
      fallDistance: 3,
      entersFromAbove: true,
    };
  }
}

const DropFixture = () => {
  const [board, setBoard] = useState(initialBoard);
  const [animationPhase, setAnimationPhase] = useState<AnimationPhase>("idle");

  const startDrop = () => {
    setAnimationPhase("drop");
    setBoard(droppedBoard);
  };

  return (
    <MotionConfig reducedMotion="never">
      <main className="mx-auto w-96 p-4">
        <button type="button" onClick={startDrop}>
          Start drop
        </button>
        <GameBoard
          board={board}
          matches={[]}
          selectedGem={null}
          animationPhase={animationPhase}
          onSwipe={() => {}}
          onGemTap={() => {}}
          isAnimating={animationPhase === "drop"}
        />
      </main>
    </MotionConfig>
  );
};

const root = document.getElementById("root");
if (!root) throw new Error("Failed to find fixture root");
createRoot(root).render(<DropFixture />);
