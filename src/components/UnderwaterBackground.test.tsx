import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { UnderwaterBackground } from "@/components/UnderwaterBackground";
import { renderCaustics } from "@/utils/underwaterLogic";

vi.mock("@/utils/underwaterLogic", async (importActual) => {
  const actual = await importActual<typeof import("@/utils/underwaterLogic")>();
  return {
    ...actual,
    renderCaustics: vi.fn(),
  };
});

const createContext = () => {
  const context = {
    arc: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    createImageData: vi.fn((width: number, height: number): ImageData => {
      const imageData = {
        data: new Uint8ClampedArray(width * height * 4),
        width,
        height,
      };
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      return imageData as ImageData;
    }),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    drawImage: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    putImageData: vi.fn(),
    setTransform: vi.fn(),
    stroke: vi.fn(),
  };
  const unknownContext: unknown = context;
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return unknownContext as CanvasRenderingContext2D;
};

describe("UnderwaterBackground", () => {
  const animationFrames: FrameRequestCallback[] = [];
  const contexts = new WeakMap<HTMLCanvasElement, CanvasRenderingContext2D>();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(performance, "now").mockReturnValue(0);
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: false,
        media: "",
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    );
    vi.spyOn(HTMLElement.prototype, "offsetParent", "get").mockImplementation(
      function (this: HTMLElement) {
        return this.parentElement;
      },
    );
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(450);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(450);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      function (this: HTMLCanvasElement) {
        const existing = contexts.get(this);
        if (existing) return existing;
        const context = createContext();
        contexts.set(this, context);
        return context;
      },
    );

    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    animationFrames.length = 0;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("keeps caustics moving at the throttled background frame rate", () => {
    const { container } = render(
      <div>
        <UnderwaterBackground />
      </div>,
    );
    const canvas = container.querySelector("canvas");
    if (!canvas) throw new Error("Expected an underwater canvas");
    expect(canvas).toHaveAttribute("data-renderer", "canvas2d");
    expect(canvas).toHaveAttribute("data-renderer-status", "ready");
    const context = contexts.get(canvas);
    expect(context?.fillRect).toHaveBeenCalledTimes(1);

    act(() => {
      animationFrames.shift()?.(16);
    });
    expect(context?.fillRect).toHaveBeenCalledTimes(1);

    act(() => {
      animationFrames.shift()?.(34);
    });
    expect(context?.fillRect).toHaveBeenCalledTimes(2);

    act(() => {
      animationFrames.shift()?.(50);
    });
    expect(context?.fillRect).toHaveBeenCalledTimes(2);

    act(() => {
      animationFrames.shift()?.(68);
    });
    expect(context?.fillRect).toHaveBeenCalledTimes(3);
    expect(renderCaustics).toHaveBeenCalledTimes(2);
    expect(renderCaustics).toHaveBeenLastCalledWith(
      expect.any(Uint8ClampedArray),
      expect.any(Number),
      expect.any(Number),
      68,
    );
  });
});
