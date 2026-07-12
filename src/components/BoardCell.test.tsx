import { render } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { BoardCell, type CellBindFn } from "@/components/BoardCell";
import type { Gem } from "@/types/game";

const renderSpy = vi.fn();

// Replace GemComponent with a probe that counts renders. BoardCell renders
// GemComponent iff BoardCell itself renders, so this doubles as a BoardCell
// render counter.
vi.mock("@/components/GemComponent", () => ({
  GemComponent: () => {
    renderSpy();
    return null;
  },
}));

const gem: Gem = {
  id: "gem-1",
  type: "red",
  position: { row: 0, col: 0 },
};

// use-gesture's real binder does DOM/pointer setup we don't need here — a
// no-op stand-in suffices to verify the memo comparator behaviour.
// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
const makeBind = (): CellBindFn => (() => ({})) as unknown as CellBindFn;

const noopActivate = () => {};

describe("BoardCell", () => {
  test("does not re-render when only `bind` identity changes", () => {
    renderSpy.mockClear();

    const { rerender } = render(
      <BoardCell
        gem={gem}
        rowIndex={0}
        colIndex={0}
        isSelected={false}
        isAnimating={false}
        bind={makeBind()}
        onActivate={noopActivate}
      />,
    );
    expect(renderSpy).toHaveBeenCalledTimes(1);

    // Same gem/isSelected/isAnimating but a fresh `bind` (as
    // use-gesture returns every render) MUST NOT re-render the cell —
    // this is the whole point of excluding `bind` from the memo
    // comparator.
    rerender(
      <BoardCell
        gem={gem}
        rowIndex={0}
        colIndex={0}
        isSelected={false}
        isAnimating={false}
        bind={makeBind()}
        onActivate={noopActivate}
      />,
    );
    expect(renderSpy).toHaveBeenCalledTimes(1);
  });

  // This asserts the COMPARATOR behaviour — a stale `onActivate` closure
  // is exactly what the memo permits. That is only safe when the callback
  // provider reads state through a ref rather than its own closure (see
  // `gameStateRef` in `useMatch3Game`); otherwise keyboard tap-to-swap
  // silently degrades to "re-select" on the second cell. The functional
  // regression is caught by
  // `src/components/BoardCell.integration.test.tsx`.
  test("does not re-render when only `onActivate` identity changes", () => {
    renderSpy.mockClear();
    const bind = makeBind();

    const { rerender } = render(
      <BoardCell
        gem={gem}
        rowIndex={0}
        colIndex={0}
        isSelected={false}
        isAnimating={false}
        bind={bind}
        onActivate={() => {}}
      />,
    );
    expect(renderSpy).toHaveBeenCalledTimes(1);

    // A fresh `onActivate` closure at every render must not cascade into
    // a cell re-render, mirroring the `bind`-exclusion rule.
    rerender(
      <BoardCell
        gem={gem}
        rowIndex={0}
        colIndex={0}
        isSelected={false}
        isAnimating={false}
        bind={bind}
        onActivate={() => {}}
      />,
    );
    expect(renderSpy).toHaveBeenCalledTimes(1);
  });

  test("re-renders when `isSelected` flips", () => {
    renderSpy.mockClear();
    const bind = makeBind();

    const { rerender } = render(
      <BoardCell
        gem={gem}
        rowIndex={0}
        colIndex={0}
        isSelected={false}
        isAnimating={false}
        bind={bind}
        onActivate={noopActivate}
      />,
    );
    expect(renderSpy).toHaveBeenCalledTimes(1);

    rerender(
      <BoardCell
        gem={gem}
        rowIndex={0}
        colIndex={0}
        isSelected
        isAnimating={false}
        bind={bind}
        onActivate={noopActivate}
      />,
    );
    expect(renderSpy).toHaveBeenCalledTimes(2);
  });

  test("re-renders when `isAnimating` flips", () => {
    renderSpy.mockClear();
    const bind = makeBind();

    const { rerender } = render(
      <BoardCell
        gem={gem}
        rowIndex={0}
        colIndex={0}
        isSelected={false}
        isAnimating={false}
        bind={bind}
        onActivate={noopActivate}
      />,
    );
    expect(renderSpy).toHaveBeenCalledTimes(1);

    rerender(
      <BoardCell
        gem={gem}
        rowIndex={0}
        colIndex={0}
        isSelected={false}
        isAnimating
        bind={bind}
        onActivate={noopActivate}
      />,
    );
    expect(renderSpy).toHaveBeenCalledTimes(2);
  });

  test("re-renders when the gem reference changes", () => {
    renderSpy.mockClear();
    const bind = makeBind();

    const { rerender } = render(
      <BoardCell
        gem={gem}
        rowIndex={0}
        colIndex={0}
        isSelected={false}
        isAnimating={false}
        bind={bind}
        onActivate={noopActivate}
      />,
    );
    expect(renderSpy).toHaveBeenCalledTimes(1);

    // A new gem with the same id/type is still a different reference (this
    // is how the hook always produces post-swap boards); the cell must
    // re-render so it picks up the new position/animation target.
    const nextGem: Gem = { ...gem };
    rerender(
      <BoardCell
        gem={nextGem}
        rowIndex={0}
        colIndex={0}
        isSelected={false}
        isAnimating={false}
        bind={bind}
        onActivate={noopActivate}
      />,
    );
    expect(renderSpy).toHaveBeenCalledTimes(2);
  });
});
