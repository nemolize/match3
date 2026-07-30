import { BOARD_SIZE } from "@/constants/game";

import {
  advanceWaterTime,
  collectNewFragmentBursts,
  FRAGMENT_INSTANCE_STRIDE,
  fragmentCount,
  GEM_INSTANCE_STRIDE,
  mergeActiveFragments,
  packFragmentBursts,
  packGemScene,
} from "./sceneState";
import {
  backgroundShader,
  blitShader,
  fragmentShader,
  gemShader,
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
const TIMING_QUERY_COUNT = 8;
const MAX_WATER_FRAME_DELTA_MS = 50;
const PASS_NAMES = [
  "backgroundCaustics",
  "gemRefraction",
  "fragments",
  "composite",
] as const;

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
    const [backgroundModule, blitModule, gemModule, fragmentModule] =
      await Promise.all([
        createShaderModule(device, backgroundShader, "background-caustics"),
        createShaderModule(device, blitShader, "composite-blit"),
        createShaderModule(device, gemShader, "gem-refraction"),
        createShaderModule(device, fragmentShader, "fragments"),
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
    const sampler = device.createSampler({
      label: "board-linear-sampler",
      magFilter: "linear",
      minFilter: "linear",
    });

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
    const frameBindGroup = device.createBindGroup({
      layout: backgroundPipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
    });
    let compositeBindGroup: GPUBindGroup | null = null;
    let timingFrameCount = 0;
    let fragmentTimingFrameCount = 0;
    let timingCaptureActive = false;
    const frameUniform = new Float32Array(16);
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
      uniformBuffer.destroy();
      gemBuffer.destroy();
      fragmentBuffer.destroy();
      querySet?.destroy();
      queryResolveBuffer?.destroy();
      queryReadBuffer?.destroy();
      device.removeEventListener("uncapturederror", handleUncapturedError);
      device.destroy();
    };
    device.addEventListener("uncapturederror", handleUncapturedError);

    const timestampWrites = (
      passIndex: number,
      active = true,
    ): GPURenderPassTimestampWrites | undefined =>
      querySet && timingCaptureActive && active
        ? {
            querySet,
            beginningOfPassWriteIndex: passIndex * 2,
            endOfPassWriteIndex: passIndex * 2 + 1,
          }
        : undefined;

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
      const additions = packFragmentBursts(
        collected.bursts,
        layout,
        now,
        scene.particleRandom,
      );
      fragments = mergeActiveFragments(fragments, additions, now);
      activeBurstExpiries = activeBurstExpiries.filter(
        (expiry) => expiry > now,
      );
      activeBurstExpiries.push(
        ...collected.bursts.map(() => now + (additions[9] ?? 0)),
      );
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
        fragments = mergeActiveFragments(fragments, new Float32Array(), now);
        activeBurstExpiries = activeBurstExpiries.filter(
          (expiry) => expiry > now,
        );
        nextFragmentExpiry =
          activeBurstExpiries.length === 0
            ? Number.POSITIVE_INFINITY
            : Math.min(...activeBurstExpiries);
        if (fragments.length > 0) {
          device.queue.writeBuffer(fragmentBuffer, 0, fragments);
        }
        reportWorkload();
      }

      if (scene.reducedMotion) {
        lastWaterFrameTime = null;
      } else {
        if (lastWaterFrameTime !== null) {
          waterTimeMs = advanceWaterTime(
            waterTimeMs,
            lastWaterFrameTime,
            now,
            MAX_WATER_FRAME_DELTA_MS,
          );
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
        timestampWrites: timestampWrites(0),
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
        timestampWrites: timestampWrites(1),
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
        timestampWrites: timestampWrites(2, activeFragmentCount > 0),
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
        timestampWrites: timestampWrites(3),
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
        if (passName === "fragments" && fragmentTimingFrameCount === 0) {
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
        scene = nextScene;
        if (scene.reducedMotion && fragments.length > 0) {
          fragments = new Float32Array();
          activeBurstExpiries = [];
          nextFragmentExpiry = Number.POSITIVE_INFINITY;
          reportWorkload();
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
