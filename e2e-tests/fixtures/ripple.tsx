import "@/styles/globals.css";

import { MotionConfig } from "motion/react";
import { useState } from "react";
import { createRoot } from "react-dom/client";

import { GameBoard } from "@/components/GameBoard";
import { TIMING_CONFIG } from "@/config/timing";
import { BOARD_SIZE } from "@/constants/game";
import type { Gem, Match } from "@/types/game";

const createBoard = (): (Gem | null)[][] =>
  Array.from({ length: BOARD_SIZE }, () =>
    Array<Gem | null>(BOARD_SIZE).fill(null),
  );

const createRippleBoard = (): (Gem | null)[][] => {
  const board = createBoard();
  const row = 3;
  for (let col = 2; col <= 4; col += 1) {
    const boardRow = board[row];
    if (boardRow) {
      boardRow[col] = {
        id: `ripple-${col}`,
        type: "blue",
        position: { row, col },
      };
    }
  }
  return board;
};

const rippleMatch: Match = {
  positions: [
    { row: 3, col: 2 },
    { row: 3, col: 3 },
    { row: 3, col: 4 },
  ],
  score: 30,
  type: "blue",
};

const RippleFixture = () => {
  const [board, setBoard] = useState(createRippleBoard);
  const [matches, setMatches] = useState<Match[]>([]);

  const triggerRipple = () => {
    setMatches([rippleMatch]);
    window.setTimeout(() => {
      setBoard(createBoard());
      setMatches([]);
    }, TIMING_CONFIG.matchClearDelay);
  };
  const clearWithoutRipple = () => {
    window.setTimeout(() => {
      setBoard(createBoard());
    }, TIMING_CONFIG.matchClearDelay);
  };

  return (
    <MotionConfig reducedMotion="user">
      <main className="mx-auto w-96 p-4">
        <button
          type="button"
          disabled={matches.length > 0}
          onClick={triggerRipple}
        >
          Trigger clear ripple
        </button>
        <button type="button" onClick={clearWithoutRipple}>
          Clear without ripple
        </button>
        <GameBoard
          board={board}
          matches={matches}
          selectedGem={null}
          animationPhase={matches.length > 0 ? "idle" : "drop"}
          onSwipe={() => {}}
          onGemTap={() => {}}
          isAnimating={matches.length > 0}
        />
      </main>
    </MotionConfig>
  );
};

const root = document.getElementById("root");
if (!root) throw new Error("Failed to find fixture root");
createRoot(root).render(<RippleFixture />);
