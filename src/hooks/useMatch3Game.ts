import { useCallback, useRef, useState } from "react";

import { TIMING_CONFIG } from "@/config/timing";
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

const createInitialGameState = (): GameState => ({
  board: createInitialBoard(),
  score: 0,
  selectedGem: null,
  isAnimating: false,
  matches: [],
  gameOver: false,
  level: 1,
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const levelForScore = (score: number): number => Math.floor(score / 10000) + 1;

const areAdjacent = (a: Position, b: Position): boolean =>
  Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1;

export const useMatch3Game = () => {
  const [gameState, setGameState] = useState<GameState>(createInitialGameState);

  // Incremented on New Game so an in-flight cascade loop from the previous
  // game stops writing state.
  const gameGenerationRef = useRef(0);

  const processMatches = useCallback(
    async (board: (Gem | null)[][], score: number) => {
      const generation = gameGenerationRef.current;
      const isStale = () => gameGenerationRef.current !== generation;

      setGameState((prev) => ({ ...prev, isAnimating: true }));

      let currentBoard = board;
      let totalScore = score;
      let comboMultiplier = 1;

      // Keep processing matches until no more matches are found
      while (true) {
        const matches = findMatches(currentBoard);

        if (matches.length === 0) {
          break;
        }

        const matchScore = matches.reduce((sum, match) => sum + match.score, 0);
        totalScore += Math.floor(matchScore * comboMultiplier);
        comboMultiplier += 0.5;

        // Highlight matched gems and commit the score for this step so the
        // header ticks up while the cascade unfolds
        if (isStale()) return;
        const scoreSoFar = totalScore;
        setGameState((prev) => ({
          ...prev,
          matches,
          score: scoreSoFar,
          level: levelForScore(scoreSoFar),
        }));

        // Let players see the matched gems before they clear
        await sleep(TIMING_CONFIG.matchClearDelay);

        currentBoard = fillEmptySpaces(
          applyGravity(removeMatches(currentBoard, matches)),
        );

        if (isStale()) return;
        setGameState((prev) => ({
          ...prev,
          board: currentBoard,
          matches: [],
        }));

        // Let the drop animation settle before the next cascade step
        await sleep(TIMING_CONFIG.dropAnimationWait);
      }

      if (isStale()) return;
      const gameOver = !hasValidMoves(currentBoard);

      setGameState((prev) => ({
        ...prev,
        board: currentBoard,
        score: totalScore,
        isAnimating: false,
        gameOver,
        level: levelForScore(totalScore),
      }));
    },
    [],
  );

  const handleSwipe = useCallback(
    async (from: Position, to: Position) => {
      if (gameState.isAnimating || gameState.gameOver) return;
      if (!areAdjacent(from, to)) return;

      const generation = gameGenerationRef.current;
      const isStale = () => gameGenerationRef.current !== generation;

      if (isValidSwap(gameState.board, from, to)) {
        setGameState((prev) => ({ ...prev, isAnimating: true }));

        const newBoard = swapGems(gameState.board, from, to);
        setGameState((prev) => ({ ...prev, board: newBoard }));

        // Let the swap animation play before matches are highlighted
        await sleep(TIMING_CONFIG.swapDuration);
        if (isStale()) return;

        await processMatches(newBoard, gameState.score);
      } else {
        // Invalid swap: animate the attempt and revert so the player
        // gets clear feedback instead of silence
        setGameState((prev) => ({ ...prev, isAnimating: true }));

        const swappedBoard = swapGems(gameState.board, from, to);
        setGameState((prev) => ({ ...prev, board: swappedBoard }));

        await sleep(TIMING_CONFIG.swapDuration);
        if (isStale()) return;

        const revertedBoard = swapGems(swappedBoard, from, to);
        setGameState((prev) => ({
          ...prev,
          board: revertedBoard,
          isAnimating: false,
        }));
      }
    },
    [gameState, processMatches],
  );

  const newGame = useCallback(() => {
    gameGenerationRef.current += 1;
    const nextState = createInitialGameState();
    setGameState(nextState);
    // createInitialBoard avoids initial matches, but keep the safety net
    const matches = findMatches(nextState.board);
    if (matches.length > 0) processMatches(nextState.board, 0);
  }, [processMatches]);

  return {
    gameState,
    handleSwipe,
    newGame,
  };
};
