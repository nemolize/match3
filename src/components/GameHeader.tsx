import { motion } from "motion/react";

interface GameHeaderProps {
  score: number;
  level: number;
  gameOver: boolean;
  onNewGame: () => void;
}

export const GameHeader = ({
  score,
  level,
  gameOver,
  onNewGame,
}: GameHeaderProps) => {
  return (
    <div className="mb-6 flex items-center justify-between px-4">
      {/* Score */}
      <motion.div
        className="text-center"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.2 }}
      >
        <div className="mb-1 text-sm font-medium text-gray-300">Score</div>
        <motion.div
          className="bg-gradient-to-r from-yellow-400 to-orange-500 bg-clip-text text-2xl font-bold text-transparent"
          key={score}
          initial={{ scale: 1.2 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.3 }}
        >
          {score.toLocaleString()}
        </motion.div>
      </motion.div>

      {/* Level */}
      <motion.div
        className="text-center"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.3 }}
      >
        <div className="mb-1 text-sm font-medium text-gray-300">Level</div>
        <div className="bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-2xl font-bold text-transparent text-white">
          {level}
        </div>
      </motion.div>

      {/* New Game Button */}
      <motion.button
        className="rounded-lg bg-gradient-to-r from-green-500 to-teal-500 px-4 py-2 font-semibold text-white shadow-lg transition-all duration-200 hover:shadow-xl active:scale-95"
        onClick={onNewGame}
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.4 }}
        whileTap={{ scale: 0.95 }}
      >
        New Game
      </motion.button>

      {/* Game Over Overlay */}
      {gameOver && (
        <motion.div
          className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          <div className="text-center">
            <motion.div
              className="mb-4 text-3xl font-bold text-white"
              initial={{ scale: 0, y: -20 }}
              animate={{ scale: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              Game Over!
            </motion.div>
            <motion.div
              className="mb-6 text-xl text-gray-300"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              Final Score: {score.toLocaleString()}
            </motion.div>
            <motion.button
              className="rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 px-6 py-3 font-semibold text-white shadow-lg transition-all duration-200 hover:shadow-xl active:scale-95"
              onClick={onNewGame}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.6 }}
              whileTap={{ scale: 0.95 }}
            >
              Play Again
            </motion.button>
          </div>
        </motion.div>
      )}
    </div>
  );
};
