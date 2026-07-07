import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { TIMING_CONFIG } from "@/config/timing";
import { useMatch3Game } from "@/hooks/useMatch3Game";
import type { Gem, Match } from "@/types/game";
import * as gameLogic from "@/utils/gameLogic";

vi.mock("@/utils/gameLogic", async () => {
  const actual =
    await vi.importActual<typeof import("@/utils/gameLogic")>(
      "@/utils/gameLogic",
    );
  return {
    ...actual,
    isValidSwap: vi.fn(actual.isValidSwap),
    findMatches: vi.fn(actual.findMatches),
    hasValidMoves: vi.fn(actual.hasValidMoves),
  };
});

// Compare boards by the gem `type` grid so we can assert a revert without
// relying on reference equality (the hook always returns fresh arrays).
const gemTypeGrid = (board: (Gem | null)[][]) =>
  board.map((row) => row.map((gem) => gem?.type ?? null));

const someSwipe = { from: { row: 0, col: 0 }, to: { row: 0, col: 1 } };

describe("useMatch3Game", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Default: no swap creates a match, no cascade fires, board has moves.
    vi.mocked(gameLogic.isValidSwap).mockReturnValue(false);
    vi.mocked(gameLogic.findMatches).mockReturnValue([]);
    vi.mocked(gameLogic.hasValidMoves).mockReturnValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.mocked(gameLogic.isValidSwap).mockReset();
    vi.mocked(gameLogic.findMatches).mockReset();
    vi.mocked(gameLogic.hasValidMoves).mockReset();
  });

  test("invalid swipe animates the attempt and reverts after swapDuration", async () => {
    const { result } = renderHook(() => useMatch3Game());
    const initialLayout = gemTypeGrid(result.current.gameState.board);

    await act(async () => {
      void result.current.handleSwipe(someSwipe.from, someSwipe.to);
      // Let the synchronous setGameState inside swapAndWait flush
      await Promise.resolve();
    });

    // Mid-animation: the swap has been applied and the input lock is up.
    // Check the two swapped cells directly — asserting the whole grid
    // differs would flake when the two adjacent gems share a type.
    expect(result.current.gameState.isAnimating).toBe(true);
    const midLayout = gemTypeGrid(result.current.gameState.board);
    expect(midLayout[0]?.[0]).toBe(initialLayout[0]?.[1]);
    expect(midLayout[0]?.[1]).toBe(initialLayout[0]?.[0]);

    // Advance past the swap animation; the revert should now be committed
    await act(async () => {
      await vi.advanceTimersByTimeAsync(TIMING_CONFIG.swapDuration + 1);
    });

    expect(result.current.gameState.isAnimating).toBe(false);
    expect(gemTypeGrid(result.current.gameState.board)).toEqual(initialLayout);
  });

  test("second handleSwipe is rejected while the first is in flight (ref lock)", async () => {
    const isValidSwapMock = vi.mocked(gameLogic.isValidSwap);
    // Both attempts would be valid; only the first should reach isValidSwap
    isValidSwapMock.mockReturnValue(true);

    const { result } = renderHook(() => useMatch3Game());
    isValidSwapMock.mockClear();

    await act(async () => {
      void result.current.handleSwipe(someSwipe.from, someSwipe.to);
      await Promise.resolve();
    });

    // Fire a second, adjacent swipe elsewhere while the first is mid-flight
    await act(async () => {
      void result.current.handleSwipe({ row: 2, col: 2 }, { row: 2, col: 3 });
      await Promise.resolve();
    });

    // Only the first call passed the ref lock and reached isValidSwap
    expect(isValidSwapMock).toHaveBeenCalledTimes(1);

    // Drain remaining timers so the first swipe settles
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.gameState.isAnimating).toBe(false);
  });

  test("score is committed on each cascade step, not just at the end", async () => {
    const step1: Match = {
      positions: [
        { row: 0, col: 0 },
        { row: 0, col: 1 },
        { row: 0, col: 2 },
      ],
      type: "red",
      score: 300,
    };
    const step2: Match = {
      positions: [
        { row: 1, col: 0 },
        { row: 1, col: 1 },
        { row: 1, col: 2 },
      ],
      type: "blue",
      score: 400,
    };

    vi.mocked(gameLogic.isValidSwap).mockReturnValue(true);
    vi.mocked(gameLogic.findMatches)
      .mockReturnValueOnce([step1])
      .mockReturnValueOnce([step2])
      .mockReturnValue([]);

    const { result } = renderHook(() => useMatch3Game());

    // Fire the swipe, then advance past swap + first cascade highlight
    await act(async () => {
      void result.current.handleSwipe(someSwipe.from, someSwipe.to);
      await vi.advanceTimersByTimeAsync(TIMING_CONFIG.swapDuration + 1);
      await vi.advanceTimersByTimeAsync(TIMING_CONFIG.matchClearDelay + 1);
    });

    // After step 1's highlight, the score has ticked but the cascade is
    // still running (dropAnimationWait pending)
    expect(result.current.gameState.score).toBe(300); // 300 * 1

    // Advance through the drop wait and step 2's highlight
    await act(async () => {
      await vi.advanceTimersByTimeAsync(TIMING_CONFIG.dropAnimationWait + 1);
      await vi.advanceTimersByTimeAsync(TIMING_CONFIG.matchClearDelay + 1);
    });

    // Step 2 uses comboMultiplier = 1.5: 300 + floor(400 * 1.5) = 900
    expect(result.current.gameState.score).toBe(900);
    // Level tracks the running score
    expect(result.current.gameState.level).toBe(1);
  });

  describe("handleGemTap state machine", () => {
    test("first tap on an empty selection selects that gem", () => {
      const { result } = renderHook(() => useMatch3Game());

      act(() => {
        result.current.handleGemTap({ row: 3, col: 4 });
      });

      expect(result.current.gameState.selectedGem).toEqual({ row: 3, col: 4 });
    });

    test("tapping the currently-selected gem again clears the selection", () => {
      const { result } = renderHook(() => useMatch3Game());

      act(() => {
        result.current.handleGemTap({ row: 3, col: 4 });
      });
      act(() => {
        result.current.handleGemTap({ row: 3, col: 4 });
      });

      expect(result.current.gameState.selectedGem).toBeNull();
    });

    test("tapping an adjacent gem attempts a swap and clears the selection", async () => {
      vi.mocked(gameLogic.isValidSwap).mockReturnValue(true);
      const { result } = renderHook(() => useMatch3Game());

      await act(async () => {
        result.current.handleGemTap({ row: 0, col: 0 });
        await Promise.resolve();
      });
      const beforeSwapCalls = vi.mocked(gameLogic.isValidSwap).mock.calls
        .length;

      await act(async () => {
        result.current.handleGemTap({ row: 0, col: 1 });
        await Promise.resolve();
      });

      // The swap runs through handleSwipe → isValidSwap
      expect(
        vi.mocked(gameLogic.isValidSwap).mock.calls.length,
      ).toBeGreaterThan(beforeSwapCalls);
      // And swapAndWait clears the selection as a side effect
      expect(result.current.gameState.selectedGem).toBeNull();

      // Drain the swap animation so the test does not leave a timer running
      await act(async () => {
        await vi.runAllTimersAsync();
      });
    });

    test("tapping a non-adjacent gem moves the selection", () => {
      const { result } = renderHook(() => useMatch3Game());

      act(() => {
        result.current.handleGemTap({ row: 0, col: 0 });
      });
      act(() => {
        result.current.handleGemTap({ row: 5, col: 7 });
      });

      expect(result.current.gameState.selectedGem).toEqual({ row: 5, col: 7 });
    });

    test("does nothing while an animation is in flight", async () => {
      // Kick off a swipe so isAnimating flips true
      vi.mocked(gameLogic.isValidSwap).mockReturnValue(true);
      const { result } = renderHook(() => useMatch3Game());

      await act(async () => {
        void result.current.handleSwipe({ row: 0, col: 0 }, { row: 0, col: 1 });
        await Promise.resolve();
      });
      expect(result.current.gameState.isAnimating).toBe(true);

      act(() => {
        result.current.handleGemTap({ row: 2, col: 2 });
      });
      expect(result.current.gameState.selectedGem).toBeNull();

      // Cleanup
      await act(async () => {
        await vi.runAllTimersAsync();
      });
    });

    test("does nothing after game over", async () => {
      vi.mocked(gameLogic.hasValidMoves).mockReturnValue(false);
      vi.mocked(gameLogic.isValidSwap).mockReturnValue(true);
      // A single cascade so hasValidMoves is consulted at the end
      vi.mocked(gameLogic.findMatches)
        .mockReturnValueOnce([
          {
            positions: [
              { row: 0, col: 0 },
              { row: 0, col: 1 },
              { row: 0, col: 2 },
            ],
            type: "red",
            score: 300,
          },
        ])
        .mockReturnValue([]);

      const { result } = renderHook(() => useMatch3Game());

      await act(async () => {
        void result.current.handleSwipe({ row: 0, col: 0 }, { row: 0, col: 1 });
        await vi.runAllTimersAsync();
      });
      expect(result.current.gameState.gameOver).toBe(true);

      act(() => {
        result.current.handleGemTap({ row: 4, col: 4 });
      });
      expect(result.current.gameState.selectedGem).toBeNull();
    });
  });

  test("newGame during a cascade sleep prevents stale state from committing", async () => {
    const step: Match = {
      positions: [
        { row: 0, col: 0 },
        { row: 0, col: 1 },
        { row: 0, col: 2 },
      ],
      type: "red",
      score: 300,
    };

    vi.mocked(gameLogic.isValidSwap).mockReturnValue(true);
    // First cascade iteration: match. Second: match again to keep the loop
    // alive so we can interrupt it. Fresh-game seed and any later call: [].
    vi.mocked(gameLogic.findMatches)
      .mockReturnValueOnce([step])
      .mockReturnValueOnce([step])
      .mockReturnValue([]);

    const { result } = renderHook(() => useMatch3Game());

    // Enter the cascade and land in step 1's score commit
    await act(async () => {
      void result.current.handleSwipe(someSwipe.from, someSwipe.to);
      await vi.advanceTimersByTimeAsync(TIMING_CONFIG.swapDuration + 1);
      await vi.advanceTimersByTimeAsync(TIMING_CONFIG.matchClearDelay + 1);
    });

    expect(result.current.gameState.score).toBe(300);

    // Interrupt with New Game while the cascade is mid-loop
    act(() => {
      result.current.newGame();
    });

    expect(result.current.gameState.score).toBe(0);
    const boardAfterNewGame = gemTypeGrid(result.current.gameState.board);

    // Drain everything: the stale loop should return without committing
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.gameState.score).toBe(0);
    expect(result.current.gameState.gameOver).toBe(false);
    expect(gemTypeGrid(result.current.gameState.board)).toEqual(
      boardAfterNewGame,
    );
  });
});
