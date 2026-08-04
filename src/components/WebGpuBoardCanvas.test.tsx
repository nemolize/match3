import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { GameBoard } from "@/components/GameBoard";
import { WebGpuBoardCanvas } from "@/components/WebGpuBoardCanvas";
import { createBoardRenderer } from "@/rendering/webgpu/createBoardRenderer";
import type {
  BoardRenderer,
  BoardRendererCallbacks,
} from "@/rendering/webgpu/types";

vi.mock("motion/react", async () => {
  const actual =
    await vi.importActual<typeof import("motion/react")>("motion/react");
  return { ...actual, useReducedMotion: () => false };
});

vi.mock("@/rendering/webgpu/createBoardRenderer", () => ({
  createBoardRenderer: vi.fn(),
}));

const createRendererMock = vi.mocked(createBoardRenderer);

const createRenderer = (): BoardRenderer => ({
  dispose: vi.fn(),
  resize: vi.fn(),
  updateScene: vi.fn(),
});

class ResizeObserverMock {
  disconnect = vi.fn();
  observe = vi.fn();
}

describe("WebGpuBoardCanvas", () => {
  let host: HTMLDivElement;
  let boardElement: HTMLDivElement;
  let offsetParentSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    createRendererMock.mockReset();
    host = document.createElement("div");
    boardElement = document.createElement("div");
    boardElement.style.columnGap = "4px";
    Object.defineProperties(host, {
      clientHeight: { configurable: true, value: 400 },
      clientWidth: { configurable: true, value: 400 },
    });
    Object.defineProperties(boardElement, {
      clientWidth: { configurable: true, value: 384 },
      offsetLeft: { configurable: true, value: 8 },
      offsetTop: { configurable: true, value: 8 },
    });
    offsetParentSpy = vi
      .spyOn(HTMLElement.prototype, "offsetParent", "get")
      .mockReturnValue(host);
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  });

  afterEach(() => {
    offsetParentSpy.mockRestore();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  test("recreates a lost renderer and restores the latest scene", async () => {
    const firstRenderer = createRenderer();
    const replacementRenderer = createRenderer();
    const rendererCallbacks: BoardRendererCallbacks[] = [];
    const onStatusChange = vi.fn();
    const boardRef = { current: boardElement };
    createRendererMock
      .mockImplementationOnce(async (_canvas, callbacks) => {
        rendererCallbacks.push(callbacks);
        return firstRenderer;
      })
      .mockImplementationOnce(async (_canvas, callbacks) => {
        rendererCallbacks.push(callbacks);
        return replacementRenderer;
      });

    const { rerender } = render(
      <WebGpuBoardCanvas
        animationPhase="idle"
        board={[]}
        boardRef={boardRef}
        matches={[]}
        onStatusChange={onStatusChange}
        selectedGem={null}
      />,
    );

    await waitFor(() => expect(createRendererMock).toHaveBeenCalledOnce());

    const latestBoard = [
      [
        {
          id: "gem-1",
          position: { col: 0, row: 0 },
          type: "blue" as const,
        },
      ],
    ];
    rerender(
      <WebGpuBoardCanvas
        animationPhase="drop"
        board={latestBoard}
        boardRef={boardRef}
        matches={[]}
        onStatusChange={onStatusChange}
        selectedGem={null}
      />,
    );

    Object.defineProperties(host, {
      clientHeight: { configurable: true, value: 600 },
      clientWidth: { configurable: true, value: 600 },
    });
    boardElement.style.columnGap = "6px";
    Object.defineProperties(boardElement, {
      clientWidth: { configurable: true, value: 560 },
      offsetLeft: { configurable: true, value: 20 },
      offsetTop: { configurable: true, value: 20 },
    });

    act(() => {
      rendererCallbacks[0]?.onStatusChange({
        message: "The WebGPU device was lost.",
        state: "lost",
      });
    });
    fireEvent.click(screen.getByRole("button", { name: "Retry renderer" }));

    await waitFor(() => expect(createRendererMock).toHaveBeenCalledTimes(2));
    expect(firstRenderer.dispose).toHaveBeenCalledOnce();
    expect(onStatusChange).toHaveBeenCalledWith({ state: "initializing" });
    expect(replacementRenderer.resize).toHaveBeenCalledWith(
      expect.objectContaining({
        boardSize: 560,
        boardX: 20,
        boardY: 20,
        canvasHeight: 600,
        canvasWidth: 600,
        gap: 6,
      }),
    );
    expect(replacementRenderer.updateScene).toHaveBeenCalledWith(
      expect.objectContaining({
        animationPhase: "drop",
        board: latestBoard,
      }),
    );
  });

  test("keeps input disabled across repeated recovery attempts", async () => {
    const firstRenderer = createRenderer();
    const failedReplacement = createRenderer();
    const recoveredRenderer = createRenderer();
    const rendererCallbacks: BoardRendererCallbacks[] = [];
    createRendererMock
      .mockImplementationOnce(async (_canvas, callbacks) => {
        rendererCallbacks.push(callbacks);
        return firstRenderer;
      })
      .mockImplementationOnce(async (_canvas, callbacks) => {
        rendererCallbacks.push(callbacks);
        return failedReplacement;
      })
      .mockImplementationOnce(async (_canvas, callbacks) => {
        rendererCallbacks.push(callbacks);
        return recoveredRenderer;
      });

    render(
      <GameBoard
        animationPhase="idle"
        board={[]}
        isAnimating={false}
        matches={[]}
        onGemTap={vi.fn()}
        onSwipe={vi.fn()}
        selectedGem={null}
      />,
    );

    await waitFor(() => expect(createRendererMock).toHaveBeenCalledOnce());
    const grid = screen.getByRole("grid");
    act(() => {
      rendererCallbacks[0]?.onStatusChange({ state: "ready" });
    });
    expect(grid).not.toHaveAttribute("inert");
    expect(grid).toHaveAttribute("aria-busy", "false");

    act(() => {
      rendererCallbacks[0]?.onStatusChange({
        message: "The WebGPU device was lost.",
        state: "lost",
      });
    });
    expect(grid).toHaveAttribute("inert", "");
    expect(grid).toHaveAttribute("aria-busy", "true");

    fireEvent.click(screen.getByRole("button", { name: "Retry renderer" }));
    expect(screen.getByRole("button", { name: "Retrying..." })).toBeDisabled();
    expect(grid).toHaveAttribute("inert", "");
    await waitFor(() => expect(createRendererMock).toHaveBeenCalledTimes(2));

    act(() => {
      rendererCallbacks[1]?.onStatusChange({
        message: "A WebGPU adapter could not be created.",
        state: "unavailable",
      });
    });
    fireEvent.click(screen.getByRole("button", { name: "Retry renderer" }));
    expect(grid).toHaveAttribute("inert", "");
    await waitFor(() => expect(createRendererMock).toHaveBeenCalledTimes(3));

    act(() => {
      rendererCallbacks[2]?.onStatusChange({ state: "ready" });
    });
    expect(grid).not.toHaveAttribute("inert");
    expect(grid).toHaveAttribute("aria-busy", "false");
    expect(
      screen.queryByRole("button", { name: "Retry renderer" }),
    ).not.toBeInTheDocument();
  });

  test("disposes a replacement that resolves after unmount", async () => {
    const firstRenderer = createRenderer();
    const staleReplacement = createRenderer();
    const rendererCallbacks: BoardRendererCallbacks[] = [];
    let resolveReplacement: ((renderer: BoardRenderer) => void) | undefined;
    createRendererMock
      .mockImplementationOnce(async (_canvas, callbacks) => {
        rendererCallbacks.push(callbacks);
        return firstRenderer;
      })
      .mockImplementationOnce(
        (_canvas, callbacks) =>
          new Promise((resolve) => {
            rendererCallbacks.push(callbacks);
            resolveReplacement = resolve;
          }),
      );

    const { unmount } = render(
      <WebGpuBoardCanvas
        animationPhase="idle"
        board={[]}
        boardRef={{ current: boardElement }}
        matches={[]}
        selectedGem={null}
      />,
    );
    await waitFor(() => expect(createRendererMock).toHaveBeenCalledOnce());
    act(() => {
      rendererCallbacks[0]?.onStatusChange({
        message: "The WebGPU device was lost.",
        state: "lost",
      });
    });
    fireEvent.click(screen.getByRole("button", { name: "Retry renderer" }));
    await waitFor(() => expect(createRendererMock).toHaveBeenCalledTimes(2));

    unmount();
    await act(async () => {
      resolveReplacement?.(staleReplacement);
    });

    expect(firstRenderer.dispose).toHaveBeenCalledOnce();
    expect(staleReplacement.dispose).toHaveBeenCalledOnce();
    expect(staleReplacement.updateScene).not.toHaveBeenCalled();
  });
});
