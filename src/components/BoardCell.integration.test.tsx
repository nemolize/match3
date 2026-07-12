import { fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { BoardCell, type CellBindFn } from "@/components/BoardCell";
import { useMatch3Game } from "@/hooks/useMatch3Game";
import type { Position } from "@/types/game";
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

// use-gesture's real binder is not needed here — we exercise the KEYBOARD
// activation path (button `onClick`), which is independent of the gesture
// layer. A stable no-op stand-in is critical: if `bind` identity changes
// per render the memoization we are asserting behaviour of would be
// bypassed entirely.
// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
const noopBind = (() => ({})) as unknown as CellBindFn;

/**
 * Renders two sibling `BoardCell`s (A at 0,0 and B at 0,1) wired to a
 * single `useMatch3Game` instance. This mirrors production — the parent
 * component owns the hook and passes `handleGemTap` to every cell — so
 * the memo behaviour is exercised end-to-end.
 */
const TwoCellHarness = () => {
  const { gameState, handleGemTap } = useMatch3Game();
  const boardRow = gameState.board[0];
  const gemA = boardRow?.[0] ?? null;
  const gemB = boardRow?.[1] ?? null;

  const isSel = (pos: Position | null, row: number, col: number) =>
    pos?.row === row && pos?.col === col;

  return (
    <>
      <BoardCell
        gem={gemA}
        rowIndex={0}
        colIndex={0}
        isSelected={isSel(gameState.selectedGem, 0, 0)}
        isAnimating={gameState.isAnimating}
        bind={noopBind}
        onActivate={handleGemTap}
      />
      <BoardCell
        gem={gemB}
        rowIndex={0}
        colIndex={1}
        isSelected={isSel(gameState.selectedGem, 0, 1)}
        isAnimating={gameState.isAnimating}
        bind={noopBind}
        onActivate={handleGemTap}
      />
    </>
  );
};

describe("BoardCell keyboard tap-to-swap integration", () => {
  beforeEach(() => {
    // Both taps are on real, adjacent cells; the swap logic only runs
    // through isValidSwap when handleGemTap sees a live selection.
    vi.mocked(gameLogic.isValidSwap).mockReturnValue(true);
    vi.mocked(gameLogic.findMatches).mockReturnValue([]);
    vi.mocked(gameLogic.hasValidMoves).mockReturnValue(true);
  });

  afterEach(() => {
    vi.mocked(gameLogic.isValidSwap).mockReset();
    vi.mocked(gameLogic.findMatches).mockReset();
    vi.mocked(gameLogic.hasValidMoves).mockReset();
  });

  /**
   * Critical-bug repro (keyboard-only path):
   *
   * When A is selected the hook only flips A's `isSelected` — B's props
   * (gem, isSelected, isAnimating) are all unchanged, so B's
   * memoized cell does NOT re-render, and B's rendered `onClick` stays
   * pointing at the previous `handleGemTap` closure — which reads a
   * stale `selectedGem === null`. Clicking B via the KEYBOARD path
   * (`event.detail === 0`) therefore hits the "no selection" branch
   * and selects B instead of swapping A↔B.
   *
   * The pointer path is unaffected because `GameBoard`'s `useGesture`
   * controller mutates in place; that binding always sees the latest
   * `handleGemTap`. This test asserts the keyboard path is fixed to
   * behave the same, by reading state through a ref inside the hook.
   */
  test("tap A then adjacent B via keyboard triggers a swap even though B's cell is memoized", () => {
    const isValidSwapMock = vi.mocked(gameLogic.isValidSwap);
    isValidSwapMock.mockClear();

    const { container } = render(<TwoCellHarness />);

    const buttons = container.querySelectorAll("button");
    expect(buttons).toHaveLength(2);
    const [buttonA, buttonB] = buttons;
    if (!buttonA || !buttonB) throw new Error("expected two rendered cells");

    // `fireEvent.click` in jsdom produces a MouseEvent with `detail: 0`,
    // which is exactly the keyboard-activation path GemComponent gates on.
    fireEvent.click(buttonA);
    fireEvent.click(buttonB);

    // With the ref-based state read this call fires; before the fix,
    // handleGemTap's stale closure on B never reached the swap branch.
    expect(isValidSwapMock).toHaveBeenCalled();
  });
});
