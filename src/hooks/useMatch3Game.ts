import { useCallback, useEffect, useState } from "react";

import type { GameState, Gem, Position } from "@/types/game";
import {
  applyGravity,
  createInitialBoard,
  fillEmptySpaces,
  findMatches,
  hasValidMoves,
  isValidSwap,
  removeMatches,
  swapGems,
} from "@/utils/gameLogic";

const initialGameState: GameState = {
  board: createInitialBoard(),
  score: 0,
  selectedGem: null,
  isAnimating: false,
  matches: [],
  gameOver: false,
  level: 1,
};

export const useMatch3Game = () => {
  const [gameState, setGameState] = useState<GameState>(initialGameState);

  const processMatches = useCallback(
    async (board: (Gem | null)[][], score: number) => {
      setGameState((prev) => ({ ...prev, isAnimating: true }));

      let currentBoard = board.map((row) => [...row]);
      let totalScore = score;
      let comboMultiplier = 1;

      // Keep processing matches until no more matches are found
      while (true) {
        const matches = findMatches(currentBoard);

        if (matches.length === 0) {
          break;
        }

        // Add score for matches
        const matchScore = matches.reduce((sum, match) => sum + match.score, 0);
        totalScore += Math.floor(matchScore * comboMultiplier);
        comboMultiplier += 0.5; // Increase combo multiplier

        // Show matched gems before clearing
        setGameState((prev) => ({
          ...prev,
          matches,
        }));

        // Wait for players to see the matched gems
        await new Promise((resolve) => setTimeout(resolve, 200));

        // Now remove matches, apply gravity, fill spaces
        currentBoard = removeMatches(currentBoard, matches);
        currentBoard = applyGravity(currentBoard);
        currentBoard = fillEmptySpaces(currentBoard);

        // Update board state with cleared matches
        setGameState((prev) => ({
          ...prev,
          board: currentBoard,
          matches: [],
        }));

        // Wait after clearing to let players see the result
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      // Check for game over
      const gameOver = !hasValidMoves(currentBoard);

      setGameState((prev) => ({
        ...prev,
        board: currentBoard,
        score: totalScore,
        isAnimating: false,
        gameOver,
        level: Math.floor(totalScore / 10000) + 1,
      }));
    },
    [],
  );

  const handleSwipe = useCallback(
    async (from: Position, to: Position) => {
      if (gameState.isAnimating || gameState.gameOver) return;

      if (isValidSwap(gameState.board, from, to)) {
        setGameState((prev) => ({ ...prev, isAnimating: true }));

        // Apply the swap immediately
        const newBoard = swapGems(gameState.board, from, to);
        setGameState((prev) => ({
          ...prev,
          board: newBoard,
          isAnimating: false,
        }));
      }
    },
    [gameState.isAnimating, gameState.gameOver, gameState.board],
  );

  const newGame = useCallback(() => {
    setGameState({
      ...initialGameState,
      board: createInitialBoard(),
    });
  }, []);

  // Process matches when board changes
  useEffect(() => {
    if (!gameState.isAnimating) {
      const matches = findMatches(gameState.board);
      if (matches.length > 0) {
        processMatches(gameState.board, gameState.score);
      }
    }
  }, [gameState.board, gameState.isAnimating, gameState.score, processMatches]);

  return {
    gameState,
    handleSwipe,
    newGame,
  };
};
