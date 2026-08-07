import { describe, expect, test, vi } from "vitest";

import { WAVE_SIMULATION_CONFIG } from "../../config/waves";
import {
  clearWaveTextures,
  createBoardRenderer,
  createGemPipeline,
  gemBlendState,
  resolveWaveDeltaFrames,
  resolveWaveSubstepCount,
} from "./createBoardRenderer";

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
  test("splits delayed wave frames into stable substeps without dropping time", () => {
    expect(resolveWaveSubstepCount(1)).toBe(1);
    expect(resolveWaveSubstepCount(2)).toBe(2);
    expect(resolveWaveSubstepCount(3)).toBe(3);
    expect(resolveWaveDeltaFrames(4)).toBe(3);
  });

  test("keeps the two-dimensional wave integration within its stability bound", () => {
    const maximumDeltaFrames = WAVE_SIMULATION_CONFIG.maximumSubstepDeltaFrames;
    const dampingAtMaximumStep =
      WAVE_SIMULATION_CONFIG.velocityDampingPerFrame ** maximumDeltaFrames;
    const stableGridCouplingLimit = (1 + dampingAtMaximumStep) / 4;

    expect(
      WAVE_SIMULATION_CONFIG.gridCoupling * maximumDeltaFrames ** 2,
    ).toBeLessThan(stableGridCouplingLimit);
  });

  test("clears both wave states when reduced motion is enabled", () => {
    const writeTexture = vi.fn();
    const textures = [{ id: "first" }, { id: "second" }];

    clearWaveTextures({ writeTexture }, textures);

    expect(writeTexture).toHaveBeenCalledTimes(2);
    expect(writeTexture).toHaveBeenNthCalledWith(
      1,
      { texture: textures[0] },
      expect.any(Uint8Array),
      { bytesPerRow: 512, rowsPerImage: 64 },
      { depthOrArrayLayers: 1, height: 64, width: 64 },
    );
    expect(writeTexture).toHaveBeenNthCalledWith(
      2,
      { texture: textures[1] },
      expect.any(Uint8Array),
      { bytesPerRow: 512, rowsPerImage: 64 },
      { depthOrArrayLayers: 1, height: 64, width: 64 },
    );
  });

  test("uses premultiplied source-over blending for gems", () => {
    expect(gemBlendState).toEqual({
      alpha: {
        dstFactor: "one-minus-src-alpha",
        operation: "add",
        srcFactor: "one",
      },
      color: {
        dstFactor: "one-minus-src-alpha",
        operation: "add",
        srcFactor: "one",
      },
    });

    const createRenderPipeline = vi.fn(() => ({}));
    const device = { createRenderPipeline };
    const module = {};

    createGemPipeline(device, "bgra8unorm", module);

    expect(createRenderPipeline).toHaveBeenCalledWith({
      fragment: {
        entryPoint: "fragmentMain",
        module,
        targets: [{ blend: gemBlendState, format: "bgra8unorm" }],
      },
      label: "gem-refraction",
      layout: "auto",
      primitive: { topology: "triangle-list" },
      vertex: { entryPoint: "vertexMain", module },
    });
  });

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
