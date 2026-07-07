import { useCallback, useEffect, useRef, useState } from "react";

import { TIMING_CONFIG } from "@/config/timing";
import type { GameState, Gem, Position } from "@/types/game";
import {
  applyGravity,
  areAdjacent,
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

export const useMatch3Game = () => {
  const [gameState, setGameState] = useState<GameState>(createInitialGameState);

  // Incremented on New Game so an in-flight cascade loop from the previous
  // game stops writing state.
  const gameGenerationRef = useRef(0);

  // Flipped to false on unmount so any pending sleeps do not commit state
  // after the hook is gone.
  const isMountedRef = useRef(true);

  // Synchronous re-entry lock. `isAnimating` cannot serve this role because
  // its setter is asynchronous, so a second `handleSwipe` firing before the
  // first has flushed its `isAnimating: true` update would race the first
  // one's cascade and clobber the board.
  const isProcessingRef = useRef(false);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /**
   * Captures the current game generation and returns a stale-check that
   * fires when either the generation has advanced (New Game) or the hook
   * has unmounted. Callers await one or more sleeps, then bail if stale.
   */
  const beginGeneration = useCallback(() => {
    const generation = gameGenerationRef.current;
    return () =>
      !isMountedRef.current || gameGenerationRef.current !== generation;
  }, []);

  /**
   * Applies a swap and lets the swap animation play out. Used by both the
   * valid path (before entering the cascade loop) and the invalid path
   * (before the revert). Returns the post-swap board so the caller can
   * feed it into the next step without re-reading state.
   */
  const swapAndWait = useCallback(
    async (
      board: (Gem | null)[][],
      from: Position,
      to: Position,
    ): Promise<(Gem | null)[][]> => {
      const swapped = swapGems(board, from, to);
      setGameState((prev) => ({
        ...prev,
        board: swapped,
        selectedGem: null,
        isAnimating: true,
      }));
      await sleep(TIMING_CONFIG.swapDuration);
      return swapped;
    },
    [],
  );

  const processMatches = useCallback(
    async (board: (Gem | null)[][], score: number) => {
      const isStale = beginGeneration();

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
    [beginGeneration],
  );

  const handleSwipe = useCallback(
    async (from: Position, to: Position) => {
      // Ref lock: reject overlapping calls synchronously so an in-flight
      // swap/cascade cannot be raced by a second one.
      if (isProcessingRef.current) return;
      if (gameState.gameOver) return;
      if (!areAdjacent(from, to)) return;

      const isStale = beginGeneration();
      const valid = isValidSwap(gameState.board, from, to);
      isProcessingRef.current = true;
      try {
        const swappedBoard = await swapAndWait(gameState.board, from, to);
        if (isStale()) return;

        if (valid) {
          await processMatches(swappedBoard, gameState.score);
          return;
        }

        // Invalid swap: revert with the same animation so the player gets
        // visible feedback instead of silence.
        const revertedBoard = swapGems(swappedBoard, from, to);
        setGameState((prev) => ({
          ...prev,
          board: revertedBoard,
          isAnimating: false,
        }));
      } finally {
        isProcessingRef.current = false;
      }
    },
    [gameState, processMatches, swapAndWait, beginGeneration],
  );

  const handleGemTap = useCallback(
    (position: Position) => {
      if (gameState.isAnimating || gameState.gameOver) return;

      const selected = gameState.selectedGem;

      // No selection yet: select the tapped gem
      if (!selected) {
        setGameState((prev) => ({ ...prev, selectedGem: position }));
        return;
      }

      // Tapping the selected gem again: deselect
      if (selected.row === position.row && selected.col === position.col) {
        setGameState((prev) => ({ ...prev, selectedGem: null }));
        return;
      }

      // Tapping an adjacent gem: attempt the swap
      if (areAdjacent(selected, position)) {
        void handleSwipe(selected, position);
        return;
      }

      // Tapping a non-adjacent gem: move the selection
      setGameState((prev) => ({ ...prev, selectedGem: position }));
    },
    [gameState, handleSwipe],
  );

  const newGame = useCallback(() => {
    gameGenerationRef.current += 1;
    // Any in-flight loop is now stale; release the lock so the fresh game
    // accepts input immediately.
    isProcessingRef.current = false;
    const nextState = createInitialGameState();
    setGameState(nextState);
    // createInitialBoard avoids initial matches, but keep the safety net
    const matches = findMatches(nextState.board);
    if (matches.length > 0) {
      isProcessingRef.current = true;
      processMatches(nextState.board, 0).finally(() => {
        isProcessingRef.current = false;
      });
    }
  }, [processMatches]);

  return {
    gameState,
    handleSwipe,
    handleGemTap,
    newGame,
  };
};
