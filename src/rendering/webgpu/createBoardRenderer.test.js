import { describe, expect, test, vi } from "vitest";

import { createBoardRenderer } from "./createBoardRenderer";

const canvas = {
  getContext: () => ({}),
};

const environment = (gpu) => ({
  cancelFrame: vi.fn(),
  gpu,
  now: () => 0,
  requestFrame: vi.fn(() => 1),
});

describe("WebGPU renderer initialization", () => {
  test("reports an unavailable WebGPU API", async () => {
    const onStatusChange = vi.fn();

    const renderer = await createBoardRenderer(
      canvas,
      { onStatusChange },
      environment(undefined),
    );

    expect(renderer).toBeNull();
    expect(onStatusChange).toHaveBeenCalledWith({
      message: "WebGPU is not supported by this browser.",
      state: "unavailable",
    });
  });

  test("reports a missing adapter", async () => {
    const onStatusChange = vi.fn();
    const gpu = {
      requestAdapter: vi.fn(async () => null),
    };

    const renderer = await createBoardRenderer(
      canvas,
      { onStatusChange },
      environment(gpu),
    );

    expect(renderer).toBeNull();
    expect(onStatusChange).toHaveBeenCalledWith({
      message: "A WebGPU adapter could not be created.",
      state: "unavailable",
    });
  });

  test("destroys the device when shader initialization fails", async () => {
    const onStatusChange = vi.fn();
    const destroy = vi.fn();
    const device = {
      createShaderModule: vi.fn(() => ({
        getCompilationInfo: async () => ({
          messages: [{ message: "invalid shader", type: "error" }],
        }),
      })),
      destroy,
      pushErrorScope: vi.fn(),
    };
    const gpu = {
      getPreferredCanvasFormat: () => "bgra8unorm",
      requestAdapter: vi.fn(async () => ({
        features: new Set(),
        requestDevice: async () => device,
      })),
    };

    const renderer = await createBoardRenderer(
      canvas,
      { onStatusChange },
      environment(gpu),
    );

    expect(renderer).toBeNull();
    expect(destroy).toHaveBeenCalledOnce();
    expect(onStatusChange).toHaveBeenCalledWith({
      message: expect.stringContaining("invalid shader"),
      state: "unavailable",
    });
  });
});
