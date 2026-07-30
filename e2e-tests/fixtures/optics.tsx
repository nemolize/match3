import "@/styles/globals.css";

import { MotionConfig } from "motion/react";
import { useState } from "react";
import { createRoot } from "react-dom/client";

import { GameBoard } from "@/components/GameBoard";
import { BOARD_SIZE } from "@/constants/game";
import type { Gem } from "@/types/game";

const createBoard = (): (Gem | null)[][] =>
  Array.from({ length: BOARD_SIZE }, () =>
    Array<Gem | null>(BOARD_SIZE).fill(null),
  );

const opticalGemTypes: Gem["type"][] = [
  "red",
  "blue",
  "green",
  "yellow",
  "purple",
  "orange",
];

const opticalBoard = createBoard();
const opticalRow = 3;
opticalGemTypes.forEach((type, index) => {
  const col = index + 1;
  const boardRow = opticalBoard[opticalRow];
  if (boardRow) {
    boardRow[col] = {
      id: `optical-${type}`,
      type,
      position: { row: opticalRow, col },
    };
  }
});

const OpticsFixture = () => {
  const [board, setBoard] = useState(opticalBoard);

  return (
    <MotionConfig reducedMotion="never">
      <main className="mx-auto w-96 p-4">
        <button type="button" onClick={() => setBoard(createBoard())}>
          Clear board
        </button>
        <GameBoard
          board={board}
          matches={[]}
          selectedGem={null}
          animationPhase="idle"
          onSwipe={() => {}}
          onGemTap={() => {}}
          isAnimating={false}
        />
      </main>
    </MotionConfig>
  );
};

const root = document.getElementById("root");
if (!root) throw new Error("Failed to find fixture root");
createRoot(root).render(<OpticsFixture />);
