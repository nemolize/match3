import { WAVE_SIMULATION_CONFIG } from "@/config/waves";
import { BOARD_SIZE } from "@/constants/game";

import {
  advanceWaterTime,
  collectNewFragmentBursts,
  FRAGMENT_INSTANCE_STRIDE,
  fragmentBurstExpiries,
  fragmentCount,
  GEM_INSTANCE_STRIDE,
  mergeActiveFragments,
  packFragmentBursts,
  packGemScene,
  packWaveImpulses,
  WAVE_IMPULSE_STRIDE,
} from "./sceneState";
import {
  backgroundShader,
  blitShader,
  fragmentShader,
  gemShader,
  waveSimulationShader,
} from "./shaders";
import type {
  BoardLayout,
  BoardRenderer,
  BoardRendererCallbacks,
  BoardRendererEnvironment,
  BoardSceneUpdate,
  GpuTimingPass,
  RendererGpuTimings,
} from "./types";

const FRAME_UNIFORM_BYTES = 64;
const MAX_GEMS = BOARD_SIZE * BOARD_SIZE;
const INITIAL_FRAGMENT_CAPACITY = 128;
const MAX_WATER_FRAME_DELTA_MS = 50;
const REFERENCE_FRAME_DURATION_MS = 1000 / 60;
const WAVE_STEP_UNIFORM_BYTES = 16;
const WAVE_TEXTURE_BYTES_PER_PIXEL = 8;
const MAX_WAVE_SUBSTEPS = Math.ceil(
  MAX_WATER_FRAME_DELTA_MS /
    REFERENCE_FRAME_DURATION_MS /
    WAVE_SIMULATION_CONFIG.maximumSubstepDeltaFrames,
);
const SAND_TEXTURE_URL = "/images/beach-sand.webp";
const PASS_NAMES = [
  "waveSimulation",
  "backgroundCaustics",
  "gemRefraction",
  "fragments",
  "composite",
] as const;
const TIMING_QUERY_COUNT = PASS_NAMES.length * 2;
const EMPTY_FLOAT32 = new Float32Array();

export const resolveWaveDeltaFrames = (deltaFrames: number): number =>
  Math.min(
    Math.max(0, deltaFrames),
    MAX_WAVE_SUBSTEPS * WAVE_SIMULATION_CONFIG.maximumSubstepDeltaFrames,
  );

export const resolveWaveSubstepCount = (deltaFrames: number): number =>
  Math.min(
    MAX_WAVE_SUBSTEPS,
    Math.max(
      1,
      Math.ceil(
        resolveWaveDeltaFrames(deltaFrames) /
          WAVE_SIMULATION_CONFIG.maximumSubstepDeltaFrames,
      ),
    ),
  );

export const clearWaveTextures = (
  queue: GPUQueue,
  textures: readonly GPUTexture[],
): void => {
  const bytesPerRow =
    WAVE_SIMULATION_CONFIG.resolution * WAVE_TEXTURE_BYTES_PER_PIXEL;
  const zeroedWaveState = new Uint8Array(
    bytesPerRow * WAVE_SIMULATION_CONFIG.resolution,
  );
  for (const texture of textures) {
    queue.writeTexture(
      { texture },
      zeroedWaveState,
      {
        bytesPerRow,
        rowsPerImage: WAVE_SIMULATION_CONFIG.resolution,
      },
      {
        width: WAVE_SIMULATION_CONFIG.resolution,
        height: WAVE_SIMULATION_CONFIG.resolution,
        depthOrArrayLayers: 1,
      },
    );
  }
};

const createShaderModule = async (
  device: GPUDevice,
  code: string,
  label: string,
): Promise<GPUShaderModule> => {
  const module = device.createShaderModule({ code, label });
  const compilationInfo = await module.getCompilationInfo();
  const errors = compilationInfo.messages.filter(
    (message) => message.type === "error",
  );
  if (errors.length > 0) {
    throw new Error(
      `${label}: ${errors.map((message) => message.message).join("; ")}`,
    );
  }
  return module;
};

const createSandTexture = async (device: GPUDevice): Promise<GPUTexture> => {
  const response = await fetch(SAND_TEXTURE_URL);
  if (!response.ok) {
    throw new Error(`Sand texture could not be loaded (${response.status}).`);
  }
  const bitmap = await createImageBitmap(await response.blob());
  try {
    const texture = device.createTexture({
      label: "beach-sand",
      size: { width: bitmap.width, height: bitmap.height },
      format: "rgba8unorm",
      usage:
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.TEXTURE_BINDING,
    });
    device.queue.copyExternalImageToTexture(
      { source: bitmap },
      { texture },
      { width: bitmap.width, height: bitmap.height },
    );
    return texture;
  } finally {
    bitmap.close();
  }
};

const createPipeline = (
  device: GPUDevice,
  format: GPUTextureFormat,
  module: GPUShaderModule,
  blend: GPUBlendState | undefined,
  label: string,
): GPURenderPipeline =>
  device.createRenderPipeline({
    label,
    layout: "auto",
    vertex: { module, entryPoint: "vertexMain" },
    fragment: {
      module,
      entryPoint: "fragmentMain",
      targets: [{ format, blend }],
    },
    primitive: { topology: "triangle-list" },
  });

const createSourceOverBlend = (srcFactor: GPUBlendFactor): GPUBlendState => ({
  color: {
    operation: "add",
    srcFactor,
    dstFactor: "one-minus-src-alpha",
  },
  alpha: {
    operation: "add",
    srcFactor: "one",
    dstFactor: "one-minus-src-alpha",
  },
});

const alphaBlend = createSourceOverBlend("src-alpha");
export const gemBlendState = createSourceOverBlend("one");

export const createGemPipeline = (
  device: GPUDevice,
  format: GPUTextureFormat,
  module: GPUShaderModule,
): GPURenderPipeline =>
  createPipeline(device, format, module, gemBlendState, "gem-refraction");

const unavailable = (
  callbacks: BoardRendererCallbacks,
  message: string,
): null => {
  callbacks.onStatusChange({ state: "unavailable", message });
  return null;
};

export const createBoardRenderer = async (
  canvas: HTMLCanvasElement,
  callbacks: BoardRendererCallbacks,
  environment: BoardRendererEnvironment = {
    cancelFrame: (handle) => cancelAnimationFrame(handle),
    gpu: "gpu" in navigator ? navigator.gpu : undefined,
    now: () => performance.now(),
    requestFrame: (callback) => requestAnimationFrame(callback),
  },
): Promise<BoardRenderer | null> => {
  const gpu = environment.gpu;
  if (!gpu) {
    return unavailable(callbacks, "WebGPU is not supported by this browser.");
  }

  const context = canvas.getContext("webgpu");
  if (!context) {
    return unavailable(callbacks, "A WebGPU canvas context is unavailable.");
  }

  let initializationDevice: GPUDevice | null = null;
  try {
    const adapter = await gpu.requestAdapter();
    if (!adapter) {
      return unavailable(callbacks, "A WebGPU adapter could not be created.");
    }

    const timestampQuerySupported = adapter.features.has("timestamp-query");
    const device = await adapter.requestDevice({
      requiredFeatures: timestampQuerySupported ? ["timestamp-query"] : [],
    });
    initializationDevice = device;
    const format = gpu.getPreferredCanvasFormat();
    device.pushErrorScope("validation");
    const [
      backgroundModule,
      blitModule,
      gemModule,
      fragmentModule,
      waveSimulationModule,
    ] = await Promise.all([
      createShaderModule(device, backgroundShader, "background-caustics"),
      createShaderModule(device, blitShader, "composite-blit"),
      createShaderModule(device, gemShader, "gem-refraction"),
      createShaderModule(device, fragmentShader, "fragments"),
      createShaderModule(device, waveSimulationShader, "wave-simulation"),
    ]);

    const backgroundPipeline = createPipeline(
      device,
      format,
      backgroundModule,
      undefined,
      "background-caustics",
    );
    const blitPipeline = createPipeline(
      device,
      format,
      blitModule,
      undefined,
      "texture-blit",
    );
    const gemPipeline = createGemPipeline(device, format, gemModule);
    const fragmentPipeline = createPipeline(
      device,
      format,
      fragmentModule,
      alphaBlend,
      "fragments",
    );
    const waveSimulationPipeline = device.createComputePipeline({
      label: "wave-simulation",
      layout: "auto",
      compute: { module: waveSimulationModule, entryPoint: "computeMain" },
    });

    const uniformBuffer = device.createBuffer({
      label: "board-frame-uniform",
      size: FRAME_UNIFORM_BYTES,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
    });
    const gemBuffer = device.createBuffer({
      label: "gem-instances",
      size: MAX_GEMS * GEM_INSTANCE_STRIDE * Float32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE,
    });
    let fragmentCapacity = INITIAL_FRAGMENT_CAPACITY;
    let fragmentBuffer = device.createBuffer({
      label: "fragment-instances",
      size:
        fragmentCapacity *
        FRAGMENT_INSTANCE_STRIDE *
        Float32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE,
    });
    const waveStepBuffers = Array.from(
      { length: MAX_WAVE_SUBSTEPS },
      (_, index) =>
        device.createBuffer({
          label: `wave-step-uniform-${index}`,
          size: WAVE_STEP_UNIFORM_BYTES,
          usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
        }),
    );
    const waveImpulseBuffer = device.createBuffer({
      label: "wave-impulses",
      size:
        WAVE_SIMULATION_CONFIG.maximumImpulses *
        WAVE_IMPULSE_STRIDE *
        Float32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE,
    });
    const waveTextures = Array.from({ length: 2 }, (_, index) =>
      device.createTexture({
        label: `wave-state-${index}`,
        size: {
          width: WAVE_SIMULATION_CONFIG.resolution,
          height: WAVE_SIMULATION_CONFIG.resolution,
        },
        format: "rgba16float",
        usage:
          GPUTextureUsage.COPY_DST |
          GPUTextureUsage.STORAGE_BINDING |
          GPUTextureUsage.TEXTURE_BINDING,
      }),
    );
    const waveTextureViews = waveTextures.map((texture) =>
      texture.createView(),
    );
    const waveSimulationBindGroups = waveStepBuffers.map((waveStepBuffer) =>
      waveTextureViews.map((inputView, inputIndex) => {
        const outputView = waveTextureViews[1 - inputIndex];
        if (!outputView)
          throw new Error("A wave output texture is unavailable.");
        return device.createBindGroup({
          layout: waveSimulationPipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: inputView },
            { binding: 1, resource: outputView },
            { binding: 2, resource: { buffer: waveStepBuffer } },
            { binding: 3, resource: { buffer: waveImpulseBuffer } },
          ],
        });
      }),
    );
    const sampler = device.createSampler({
      label: "board-linear-sampler",
      magFilter: "linear",
      minFilter: "linear",
    });
    const sandTexture = await createSandTexture(device);

    const querySet = timestampQuerySupported
      ? device.createQuerySet({
          count: TIMING_QUERY_COUNT,
          label: "board-pass-timestamps",
          type: "timestamp",
        })
      : null;
    const queryResolveBuffer = querySet
      ? device.createBuffer({
          label: "board-timestamp-resolve",
          size: TIMING_QUERY_COUNT * BigUint64Array.BYTES_PER_ELEMENT,
          usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.QUERY_RESOLVE,
        })
      : null;
    const queryReadBuffer = querySet
      ? device.createBuffer({
          label: "board-timestamp-read",
          size: TIMING_QUERY_COUNT * BigUint64Array.BYTES_PER_ELEMENT,
          usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        })
      : null;
    const initializationError = await device.popErrorScope();
    if (initializationError) {
      throw new Error(initializationError.message);
    }

    let disposed = false;
    let lost = false;
    let ready = false;
    let configured = false;
    let readyCheckPending = false;
    let animationFrame = 0;
    let lastWaterFrameTime: number | null = null;
    let waterTimeMs = 0;
    let waveReadIndex = 0;
    let layout: BoardLayout | null = null;
    let scene: BoardSceneUpdate | null = null;
    let previousPositions = new Map<string, { row: number; col: number }>();
    let previousMatchKey = "";
    let lastGemScene:
      | Pick<
          BoardSceneUpdate,
          "animationPhase" | "board" | "reducedMotion" | "selectedGem"
        >
      | undefined;
    let gemCount = 0;
    let fragments = new Float32Array();
    let pendingWaveImpulses = EMPTY_FLOAT32;
    let activeBurstExpiries: number[] = [];
    let nextFragmentExpiry = Number.POSITIVE_INFINITY;
    let backgroundTexture: GPUTexture | null = null;
    let sceneTexture: GPUTexture | null = null;
    let backgroundTextureView: GPUTextureView | null = null;
    let sceneTextureView: GPUTextureView | null = null;
    let backgroundBindGroup: GPUBindGroup | null = null;
    let gemBindGroup: GPUBindGroup | null = null;
    let fragmentBindGroup = device.createBindGroup({
      layout: fragmentPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: { buffer: fragmentBuffer } },
      ],
    });
    const sandTextureView = sandTexture.createView();
    const frameBindGroups = waveTextureViews.map((waveTextureView) =>
      device.createBindGroup({
        layout: backgroundPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: uniformBuffer } },
          { binding: 1, resource: sampler },
          { binding: 2, resource: sandTextureView },
          { binding: 3, resource: waveTextureView },
        ],
      }),
    );
    let compositeBindGroup: GPUBindGroup | null = null;
    let timingFrameCount = 0;
    let waveTimingFrameCount = 0;
    let fragmentTimingFrameCount = 0;
    let timingCaptureActive = false;
    const frameUniform = new Float32Array(16);
    const waveStepUniform = new Float32Array(4);
    const performanceApiRef: {
      current?: Window["__match3RendererPerformance"];
    } = {};
    const handleUncapturedError = (event: GPUUncapturedErrorEvent) => {
      if (disposed) return;
      lost = true;
      const message = `WebGPU rendering failed: ${event.error.message}`;
      releaseResources();
      callbacks.onStatusChange({
        state: "unavailable",
        message,
      });
    };
    const releaseResources = () => {
      if (disposed) return;
      disposed = true;
      environment.cancelFrame(animationFrame);
      animationFrame = 0;
      if (
        performanceApiRef.current &&
        window.__match3RendererPerformance === performanceApiRef.current
      ) {
        delete window.__match3RendererPerformance;
      }
      if (configured) {
        context.unconfigure();
        configured = false;
      }
      backgroundTexture?.destroy();
      sceneTexture?.destroy();
      sandTexture.destroy();
      uniformBuffer.destroy();
      gemBuffer.destroy();
      fragmentBuffer.destroy();
      waveStepBuffers.forEach((buffer) => buffer.destroy());
      waveImpulseBuffer.destroy();
      waveTextures.forEach((texture) => texture.destroy());
      querySet?.destroy();
      queryResolveBuffer?.destroy();
      queryReadBuffer?.destroy();
      device.removeEventListener("uncapturederror", handleUncapturedError);
      device.destroy();
    };
    device.addEventListener("uncapturederror", handleUncapturedError);

    const timestampWrites = (passIndex: number, active = true) =>
      querySet && timingCaptureActive && active
        ? {
            querySet,
            beginningOfPassWriteIndex: passIndex * 2,
            endOfPassWriteIndex: passIndex * 2 + 1,
          }
        : undefined;
    const waveTimestampWrites = (
      substepIndex: number,
      substepCount: number,
    ) => {
      if (!querySet || !timingCaptureActive) return undefined;
      const isFirstSubstep = substepIndex === 0;
      const isLastSubstep = substepIndex === substepCount - 1;
      if (!isFirstSubstep && !isLastSubstep) return undefined;
      return {
        querySet,
        ...(isFirstSubstep ? { beginningOfPassWriteIndex: 0 } : {}),
        ...(isLastSubstep ? { endOfPassWriteIndex: 1 } : {}),
      };
    };

    const reportWorkload = () => {
      callbacks.onWorkloadChange?.({
        burstCount: activeBurstExpiries.length,
        particleCount: fragmentCount(fragments),
      });
    };

    const ensureFragmentCapacity = (count: number) => {
      if (count <= fragmentCapacity) return;
      while (fragmentCapacity < count) fragmentCapacity *= 2;
      fragmentBuffer.destroy();
      fragmentBuffer = device.createBuffer({
        label: "fragment-instances",
        size:
          fragmentCapacity *
          FRAGMENT_INSTANCE_STRIDE *
          Float32Array.BYTES_PER_ELEMENT,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE,
      });
      fragmentBindGroup = device.createBindGroup({
        layout: fragmentPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: uniformBuffer } },
          { binding: 1, resource: { buffer: fragmentBuffer } },
        ],
      });
    };

    const uploadScene = (now: number) => {
      if (!scene) return;
      const selectedGemChanged =
        lastGemScene?.selectedGem?.row !== scene.selectedGem?.row ||
        lastGemScene?.selectedGem?.col !== scene.selectedGem?.col;
      if (
        !lastGemScene ||
        lastGemScene.board !== scene.board ||
        lastGemScene.animationPhase !== scene.animationPhase ||
        lastGemScene.reducedMotion !== scene.reducedMotion ||
        selectedGemChanged
      ) {
        const packed = packGemScene(scene, previousPositions, now);
        previousPositions = packed.positions;
        gemCount = packed.data.length / GEM_INSTANCE_STRIDE;
        if (packed.data.length > 0) {
          device.queue.writeBuffer(gemBuffer, 0, packed.data);
        }
        lastGemScene = {
          animationPhase: scene.animationPhase,
          board: scene.board,
          reducedMotion: scene.reducedMotion,
          selectedGem: scene.selectedGem,
        };
      }

      if (!layout) return;
      const collected = collectNewFragmentBursts(scene, previousMatchKey);
      previousMatchKey = collected.matchKey;
      if (scene.reducedMotion || collected.bursts.length === 0) return;
      pendingWaveImpulses = packWaveImpulses(collected.bursts, layout);
      const additions = packFragmentBursts(
        collected.bursts,
        layout,
        now,
        scene.particleRandom,
      );
      fragments = mergeActiveFragments(fragments, additions, now);
      activeBurstExpiries = fragmentBurstExpiries(fragments);
      nextFragmentExpiry = Math.min(...activeBurstExpiries);
      ensureFragmentCapacity(fragmentCount(fragments));
      device.queue.writeBuffer(fragmentBuffer, 0, fragments);
      reportWorkload();
    };

    const recreateTargets = () => {
      if (!layout) return;
      backgroundTexture?.destroy();
      sceneTexture?.destroy();
      backgroundTextureView = null;
      sceneTextureView = null;
      const size: GPUExtent3DStrict = {
        width: canvas.width,
        height: canvas.height,
      };
      backgroundTexture = device.createTexture({
        label: "background-color",
        size,
        format,
        usage:
          GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      });
      sceneTexture = device.createTexture({
        label: "scene-color",
        size,
        format,
        usage:
          GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      });
      backgroundTextureView = backgroundTexture.createView();
      sceneTextureView = sceneTexture.createView();
      backgroundBindGroup = device.createBindGroup({
        layout: blitPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: sampler },
          { binding: 1, resource: backgroundTextureView },
        ],
      });
      gemBindGroup = device.createBindGroup({
        layout: gemPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: uniformBuffer } },
          { binding: 1, resource: { buffer: gemBuffer } },
          { binding: 2, resource: sampler },
          { binding: 3, resource: backgroundTextureView },
        ],
      });
      compositeBindGroup = device.createBindGroup({
        layout: blitPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: sampler },
          { binding: 1, resource: sceneTextureView },
        ],
      });
    };

    const render = (now: number) => {
      if (
        disposed ||
        lost ||
        !layout ||
        !scene ||
        !backgroundTexture ||
        !sceneTexture ||
        !backgroundTextureView ||
        !sceneTextureView ||
        !backgroundBindGroup ||
        !gemBindGroup ||
        !compositeBindGroup
      ) {
        return;
      }

      if (now >= nextFragmentExpiry) {
        fragments = mergeActiveFragments(fragments, EMPTY_FLOAT32, now);
        activeBurstExpiries = fragmentBurstExpiries(fragments);
        nextFragmentExpiry = Math.min(...activeBurstExpiries);
        if (fragments.length > 0) {
          device.queue.writeBuffer(fragmentBuffer, 0, fragments);
        }
        reportWorkload();
      }
      let waveDeltaFrames = 0;
      if (scene.reducedMotion) {
        lastWaterFrameTime = null;
      } else {
        if (lastWaterFrameTime !== null) {
          const waterFrameDeltaMs = Math.min(
            Math.max(0, now - lastWaterFrameTime),
            MAX_WATER_FRAME_DELTA_MS,
          );
          waterTimeMs = advanceWaterTime(
            waterTimeMs,
            lastWaterFrameTime,
            now,
            MAX_WATER_FRAME_DELTA_MS,
          );
          waveDeltaFrames = waterFrameDeltaMs / REFERENCE_FRAME_DURATION_MS;
        } else {
          waveDeltaFrames = 1;
        }
        lastWaterFrameTime = now;
      }
      frameUniform[0] = layout.canvasWidth;
      frameUniform[1] = layout.canvasHeight;
      frameUniform[2] = layout.boardX;
      frameUniform[3] = layout.boardY;
      frameUniform[4] = layout.boardSize;
      frameUniform[5] = now;
      frameUniform[6] = waterTimeMs;
      frameUniform[7] = layout.gap;
      frameUniform[8] = layout.cellSize;
      frameUniform[9] = scene.reducedMotion ? 1 : 0;
      frameUniform[10] = layout.devicePixelRatio;
      device.queue.writeBuffer(uniformBuffer, 0, frameUniform);

      const checksFirstFrame = !ready && !readyCheckPending;
      if (checksFirstFrame) {
        readyCheckPending = true;
        device.pushErrorScope("validation");
      }
      const encoder = device.createCommandEncoder({ label: "board-frame" });
      if (!scene.reducedMotion) {
        const impulseCount = pendingWaveImpulses.length / WAVE_IMPULSE_STRIDE;
        if (pendingWaveImpulses.length > 0) {
          device.queue.writeBuffer(waveImpulseBuffer, 0, pendingWaveImpulses);
        }
        const boundedWaveDeltaFrames = resolveWaveDeltaFrames(waveDeltaFrames);
        const waveSubstepCount = resolveWaveSubstepCount(
          boundedWaveDeltaFrames,
        );
        const waveSubstepDeltaFrames =
          boundedWaveDeltaFrames / waveSubstepCount;
        for (
          let substepIndex = 0;
          substepIndex < waveSubstepCount;
          substepIndex += 1
        ) {
          const waveStepBuffer = waveStepBuffers[substepIndex];
          const waveBindGroup =
            waveSimulationBindGroups[substepIndex]?.[waveReadIndex];
          if (!waveStepBuffer || !waveBindGroup) return;
          waveStepUniform[0] = waterTimeMs / 1000;
          waveStepUniform[1] = waveSubstepDeltaFrames;
          waveStepUniform[2] = substepIndex === 0 ? impulseCount : 0;
          device.queue.writeBuffer(waveStepBuffer, 0, waveStepUniform);
          const wavePass = encoder.beginComputePass({
            label: `wave-simulation-${substepIndex}`,
            timestampWrites: waveTimestampWrites(
              substepIndex,
              waveSubstepCount,
            ),
          });
          wavePass.setPipeline(waveSimulationPipeline);
          wavePass.setBindGroup(0, waveBindGroup);
          wavePass.dispatchWorkgroups(
            Math.ceil(
              WAVE_SIMULATION_CONFIG.resolution /
                WAVE_SIMULATION_CONFIG.workgroupSize,
            ),
            Math.ceil(
              WAVE_SIMULATION_CONFIG.resolution /
                WAVE_SIMULATION_CONFIG.workgroupSize,
            ),
          );
          wavePass.end();
          waveReadIndex = 1 - waveReadIndex;
        }
        if (timingCaptureActive) waveTimingFrameCount += 1;
        pendingWaveImpulses = EMPTY_FLOAT32;
      }
      const frameBindGroup = frameBindGroups[waveReadIndex];
      if (!frameBindGroup) return;
      const backgroundPass = encoder.beginRenderPass({
        label: "background-caustics",
        colorAttachments: [
          {
            view: backgroundTextureView,
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
            loadOp: "clear",
            storeOp: "store",
          },
        ],
        timestampWrites: timestampWrites(1),
      });
      backgroundPass.setPipeline(backgroundPipeline);
      backgroundPass.setBindGroup(0, frameBindGroup);
      backgroundPass.draw(3);
      backgroundPass.end();

      const gemPass = encoder.beginRenderPass({
        label: "gem-refraction",
        colorAttachments: [
          {
            view: sceneTextureView,
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
            loadOp: "clear",
            storeOp: "store",
          },
        ],
        timestampWrites: timestampWrites(2),
      });
      gemPass.setPipeline(blitPipeline);
      gemPass.setBindGroup(0, backgroundBindGroup);
      gemPass.draw(3);
      if (gemCount > 0) {
        gemPass.setPipeline(gemPipeline);
        gemPass.setBindGroup(0, gemBindGroup);
        gemPass.draw(6, gemCount);
      }
      gemPass.end();

      const activeFragmentCount = fragmentCount(fragments);
      const fragmentPass = encoder.beginRenderPass({
        label: "fragments",
        colorAttachments: [
          {
            view: sceneTextureView,
            loadOp: "load",
            storeOp: "store",
          },
        ],
        timestampWrites: timestampWrites(3, activeFragmentCount > 0),
      });
      if (activeFragmentCount > 0) {
        fragmentPass.setPipeline(fragmentPipeline);
        fragmentPass.setBindGroup(0, fragmentBindGroup);
        fragmentPass.draw(6, activeFragmentCount);
        if (timingCaptureActive) fragmentTimingFrameCount += 1;
      }
      fragmentPass.end();

      const compositePass = encoder.beginRenderPass({
        label: "composite",
        colorAttachments: [
          {
            view: context.getCurrentTexture().createView(),
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
            loadOp: "clear",
            storeOp: "store",
          },
        ],
        timestampWrites: timestampWrites(4),
      });
      compositePass.setPipeline(blitPipeline);
      compositePass.setBindGroup(0, compositeBindGroup);
      compositePass.draw(3);
      compositePass.end();

      device.queue.submit([encoder.finish()]);
      if (timingCaptureActive) timingFrameCount += 1;
      if (checksFirstFrame) {
        void device.popErrorScope().then((error) => {
          readyCheckPending = false;
          if (disposed || lost) return;
          if (error) {
            lost = true;
            const message = `WebGPU rendering failed: ${error.message}`;
            releaseResources();
            callbacks.onStatusChange({
              state: "unavailable",
              message,
            });
            return;
          }
          ready = true;
          callbacks.onStatusChange({ state: "ready" });
        });
      }
    };

    const schedule = () => {
      if (disposed || lost || animationFrame !== 0 || !scene) return;
      if (scene.reducedMotion) {
        render(environment.now());
        return;
      }
      const loop = (now: number) => {
        animationFrame = 0;
        render(now);
        if (!disposed && !lost && scene?.reducedMotion === false) {
          animationFrame = environment.requestFrame(loop);
        }
      };
      animationFrame = environment.requestFrame(loop);
    };

    const readGpuTimings = async (): Promise<RendererGpuTimings> => {
      if (!querySet || !queryResolveBuffer || !queryReadBuffer) {
        return { supported: false, reason: "timestamp-query-unavailable" };
      }
      timingCaptureActive = false;
      if (timingFrameCount === 0) {
        return { supported: false, reason: "renderer-timing-api-unavailable" };
      }
      const encoder = device.createCommandEncoder({
        label: "read-board-timestamps",
      });
      encoder.resolveQuerySet(
        querySet,
        0,
        TIMING_QUERY_COUNT,
        queryResolveBuffer,
        0,
      );
      encoder.copyBufferToBuffer(
        queryResolveBuffer,
        0,
        queryReadBuffer,
        0,
        TIMING_QUERY_COUNT * BigUint64Array.BYTES_PER_ELEMENT,
      );
      device.queue.submit([encoder.finish()]);
      await queryReadBuffer.mapAsync(GPUMapMode.READ);
      const values = new BigUint64Array(queryReadBuffer.getMappedRange());
      const passes: Record<string, GpuTimingPass> = {};
      PASS_NAMES.forEach((passName, index) => {
        if (
          (passName === "waveSimulation" && waveTimingFrameCount === 0) ||
          (passName === "fragments" && fragmentTimingFrameCount === 0)
        ) {
          passes[passName] = {
            status: "inactive",
            durationNs: 0,
            sampleCount: 0,
          };
          return;
        }
        const start = values[index * 2] ?? 0n;
        const end = values[index * 2 + 1] ?? start;
        passes[passName] = {
          durationNs: Number(end - start),
          sampleCount: 1,
        };
      });
      queryReadBuffer.unmap();
      return { supported: true, timestampPeriodNs: 1, passes };
    };

    const performanceApi = {
      resetGpuTimings: async () => {
        await device.queue.onSubmittedWorkDone();
        timingFrameCount = 0;
        waveTimingFrameCount = 0;
        fragmentTimingFrameCount = 0;
        timingCaptureActive = true;
      },
      readGpuTimings,
    };
    performanceApiRef.current = performanceApi;

    void device.lost.then((info) => {
      if (disposed || info.reason === "destroyed") return;
      lost = true;
      const message = info.message || "The WebGPU device was lost.";
      releaseResources();
      callbacks.onStatusChange({
        state: "lost",
        message,
      });
    });

    return {
      updateScene: (nextScene) => {
        if (disposed) return;
        const enteringReducedMotion =
          nextScene.reducedMotion && scene?.reducedMotion === false;
        scene = nextScene;
        if (scene.reducedMotion && fragments.length > 0) {
          fragments = EMPTY_FLOAT32;
          activeBurstExpiries = [];
          nextFragmentExpiry = Number.POSITIVE_INFINITY;
          reportWorkload();
        }
        if (scene.reducedMotion) {
          pendingWaveImpulses = EMPTY_FLOAT32;
          if (enteringReducedMotion) {
            clearWaveTextures(device.queue, waveTextures);
            waveReadIndex = 0;
          }
        }
        uploadScene(environment.now());
        if (scene.reducedMotion) {
          environment.cancelFrame(animationFrame);
          animationFrame = 0;
        }
        schedule();
      },
      resize: (nextLayout) => {
        if (disposed) return;
        layout = nextLayout;
        const physicalWidth = Math.max(
          1,
          Math.round(nextLayout.canvasWidth * nextLayout.devicePixelRatio),
        );
        const physicalHeight = Math.max(
          1,
          Math.round(nextLayout.canvasHeight * nextLayout.devicePixelRatio),
        );
        if (
          !configured ||
          canvas.width !== physicalWidth ||
          canvas.height !== physicalHeight
        ) {
          canvas.width = physicalWidth;
          canvas.height = physicalHeight;
          context.configure({ device, format, alphaMode: "opaque" });
          configured = true;
          recreateTargets();
          window.__match3RendererPerformance = performanceApi;
        }
        uploadScene(environment.now());
        schedule();
      },
      dispose: releaseResources,
    };
  } catch (error) {
    initializationDevice?.destroy();
    return unavailable(
      callbacks,
      error instanceof Error
        ? `WebGPU initialization failed: ${error.message}`
        : "WebGPU initialization failed.",
    );
  }
};
