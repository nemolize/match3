import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { BoardCell, type CellBindFn } from "@/components/BoardCell";
import type { Gem } from "@/types/game";

const { motionPropsSpy } = vi.hoisted(() => ({ motionPropsSpy: vi.fn() }));

vi.mock("motion/react", () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => children,
  motion: {
    div: ({
      children,
      ...props
    }: {
      children: ReactNode;
      [key: string]: unknown;
    }) => {
      motionPropsSpy(props);
      return <div>{children}</div>;
    },
  },
}));

vi.mock("@/components/GemComponent", () => ({
  GemComponent: () => null,
}));

// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
const bind = (() => ({})) as unknown as CellBindFn;

const fallingGem: Gem = {
  id: "falling",
  type: "red",
  position: { row: 2, col: 0 },
  fallDistance: 2,
};

const renderCell = (gem: Gem) =>
  render(
    <BoardCell
      gem={gem}
      rowIndex={2}
      colIndex={0}
      isSelected={false}
      isAnimating
      animationPhase="drop"
      bind={bind}
      onActivate={() => {}}
    />,
  );

describe("BoardCell gravity animation", () => {
  beforeEach(() => {
    motionPropsSpy.mockClear();
  });

  test("passes a layout gravity transition for an existing falling gem", () => {
    renderCell(fallingGem);

    const props = motionPropsSpy.mock.lastCall?.[0];
    expect(props.initial).toEqual({ scale: 1, opacity: 1 });
    expect(props.transition).toHaveProperty("layout");
    expect(props.transition).not.toHaveProperty("y");
  });

  test("passes an above-board y transition for a refill gem", () => {
    renderCell({ ...fallingGem, entersFromAbove: true });

    const props = motionPropsSpy.mock.lastCall?.[0];
    expect(props.initial).toEqual({
      y: "calc(-200% - 0.5rem)",
      scale: 1,
      opacity: 1,
    });
    expect(props.transition).toHaveProperty("y");
    expect(props.transition).not.toHaveProperty("layout");
  });
});
