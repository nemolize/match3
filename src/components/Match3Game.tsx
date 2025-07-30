import { motion } from "framer-motion";

import { GameBoard } from "@/components/GameBoard";
import { GameHeader } from "@/components/GameHeader";
import { useMatch3Game } from "@/hooks/useMatch3Game";

export const Match3Game = () => {
  const { gameState, handleSwipe, newGame } = useMatch3Game();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 p-4">
      <motion.div
        className="relative w-full max-w-md"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
      >
        {/* Game Header */}
        <GameHeader
          score={gameState.score}
          level={gameState.level}
          gameOver={gameState.gameOver}
          onNewGame={newGame}
        />

        {/* Game Board */}
        <GameBoard
          board={gameState.board}
          matches={gameState.matches}
          onSwipe={handleSwipe}
          isAnimating={gameState.isAnimating}
        />

        {/* Instructions */}
        <motion.div
          className="mt-6 text-center text-sm text-white/80"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
        >
          <p className="mb-2">Match 3 or more gems of the same color</p>
          <p className="text-xs text-white/60">
            Swipe any gem in any direction to swap with adjacent gems
            <br />
            Only swaps that create matches are allowed!
          </p>
        </motion.div>
      </motion.div>
    </div>
  );
};
