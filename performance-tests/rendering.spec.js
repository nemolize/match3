import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import { expect, test } from "@playwright/test";

const CPU_THROTTLE_RATE = Number(process.env.PERF_CPU_THROTTLE ?? 1);
const IDLE_DURATION_MS = Number(process.env.PERF_IDLE_DURATION_MS ?? 3000);
const REPETITIONS = Number(process.env.PERF_REPETITIONS ?? 5);
const RANDOM_SEED = Number(process.env.PERF_RANDOM_SEED ?? 0x5eed1234);
const FRAME_BUDGET_MS = 25;
const METRIC_NAMES = [
  "TaskDuration",
  "ScriptDuration",
  "LayoutDuration",
  "RecalcStyleDuration",
];
const TRACE_CATEGORIES = [
  "benchmark",
  "disabled-by-default-devtools.timeline.frame",
].join(",");

const assertPositiveNumber = (value, label) => {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number`);
  }
};

const median = (values) => {
  if (values.length === 0) return 0;
  const sortedValues = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sortedValues.length / 2);
  if (sortedValues.length % 2 === 1) return sortedValues[middle] ?? 0;
  return ((sortedValues[middle - 1] ?? 0) + (sortedValues[middle] ?? 0)) / 2;
};

const percentile = (sortedValues, fraction) => {
  if (sortedValues.length === 0) return 0;
  const index = Math.min(
    sortedValues.length - 1,
    Math.floor(sortedValues.length * fraction),
  );
  return sortedValues[index] ?? 0;
};

const summarizeFrames = ({ intervals, longTasks }) => {
  const sortedIntervals = [...intervals].sort((a, b) => a - b);
  const totalInterval = intervals.reduce((sum, value) => sum + value, 0);
  const meanFrameIntervalMs =
    intervals.length === 0 ? 0 : totalInterval / intervals.length;

  return {
    sampleCount: intervals.length,
    framesPerSecond: meanFrameIntervalMs === 0 ? 0 : 1000 / meanFrameIntervalMs,
    meanFrameIntervalMs,
    p50FrameIntervalMs: percentile(sortedIntervals, 0.5),
    p95FrameIntervalMs: percentile(sortedIntervals, 0.95),
    p99FrameIntervalMs: percentile(sortedIntervals, 0.99),
    maxFrameIntervalMs: sortedIntervals.at(-1) ?? 0,
    overBudgetFrameRatio:
      intervals.length === 0
        ? 0
        : intervals.filter((value) => value > FRAME_BUDGET_MS).length /
          intervals.length,
    longTaskCount: longTasks.length,
    longTaskDurationMs: longTasks.reduce((sum, value) => sum + value, 0),
  };
};

const readCdpMetrics = async (session) => {
  const { metrics } = await session.send("Performance.getMetrics");
  return Object.fromEntries(
    metrics
      .filter(({ name }) => METRIC_NAMES.includes(name))
      .map(({ name, value }) => [name, value]),
  );
};

const subtractMetrics = (before, after) =>
  Object.fromEntries(
    METRIC_NAMES.map((name) => [
      `${name}Ms`,
      ((after[name] ?? 0) - (before[name] ?? 0)) * 1000,
    ]),
  );

const startTrace = (session) =>
  session.send("Tracing.start", {
    categories: TRACE_CATEGORIES,
    options: "record-as-much-as-possible",
    streamFormat: "json",
    transferMode: "ReturnAsStream",
  });

const stopTrace = async (session) => {
  const traceComplete = new Promise((resolve) => {
    session.once("Tracing.tracingComplete", resolve);
  });
  await session.send("Tracing.end");
  const { dataLossOccurred, stream } = await traceComplete;
  if (!stream) throw new Error("Chrome trace did not return a stream");

  let traceJson = "";
  let eof = false;
  while (!eof) {
    const chunk = await session.send("IO.read", { handle: stream });
    traceJson += chunk.base64Encoded
      ? Buffer.from(chunk.data, "base64").toString("utf8")
      : chunk.data;
    eof = chunk.eof;
  }
  await session.send("IO.close", { handle: stream });

  const { traceEvents = [] } = JSON.parse(traceJson);
  const selectedEventNames = new Set([
    "BeginFrame",
    "DrawFrame",
    "DroppedFrame",
  ]);
  const selectedEvents = traceEvents.filter((event) =>
    selectedEventNames.has(event.name),
  );
  const count = (name) =>
    selectedEvents.filter((event) => event.name === name).length;

  return {
    traceDataLoss: dataLossOccurred ? 1 : 0,
    beginFrameCount: count("BeginFrame"),
    drawFrameCount: count("DrawFrame"),
    droppedFrameCount: count("DroppedFrame"),
  };
};

const collectFrameProbe = (page, durationMs, triggerBursts) =>
  page.evaluate(
    ({ duration, shouldTriggerBursts }) =>
      new Promise((resolve, reject) => {
        const frameTimes = [];
        const longTasks = [];
        let longTaskObserver;
        let workloadObserver;
        let peakBurstCount = 0;
        let peakParticleCount = 0;
        let peakDomParticleCount = 0;

        try {
          longTaskObserver = new PerformanceObserver((list) => {
            longTasks.push(...list.getEntries().map((entry) => entry.duration));
          });
          longTaskObserver.observe({ type: "longtask", buffered: false });
        } catch {
          longTaskObserver = undefined;
        }

        if (shouldTriggerBursts) {
          const trigger = document.querySelector(
            '[data-testid="trigger-bursts"]',
          );
          if (!(trigger instanceof HTMLElement)) {
            reject(new Error("Performance burst trigger is missing"));
            return;
          }
          const readWorkload = () => {
            const bursts = Array.from(
              document.querySelectorAll("[data-particle-burst]"),
            );
            const logicalParticleCount = bursts.reduce(
              (sum, burst) =>
                sum +
                (burst instanceof HTMLElement
                  ? Number(burst.dataset.particleCount)
                  : 0),
              0,
            );
            peakBurstCount = Math.max(peakBurstCount, bursts.length);
            peakParticleCount = Math.max(
              peakParticleCount,
              logicalParticleCount,
            );
            peakDomParticleCount = Math.max(
              peakDomParticleCount,
              document.querySelectorAll("[data-particle]").length,
            );
          };
          workloadObserver = new MutationObserver(readWorkload);
          workloadObserver.observe(document.body, {
            childList: true,
            subtree: true,
          });
          trigger.click();
          queueMicrotask(readWorkload);
        }

        const startTime = performance.now();
        const sampleFrame = (now) => {
          frameTimes.push(now);

          if (now - startTime < duration) {
            requestAnimationFrame(sampleFrame);
            return;
          }

          longTaskObserver?.disconnect();
          workloadObserver?.disconnect();
          if (
            shouldTriggerBursts &&
            document.body.dataset.performanceBurstTriggered !== "true"
          ) {
            reject(new Error("Performance burst trigger did not run"));
            return;
          }
          resolve({
            intervals: frameTimes
              .slice(1)
              .map((frameTime, index) => frameTime - (frameTimes[index] ?? 0)),
            longTasks,
            peakBurstCount,
            peakDomParticleCount,
            peakParticleCount,
          });
        };

        requestAnimationFrame(sampleFrame);
      }),
    { duration: durationMs, shouldTriggerBursts: triggerBursts },
  );

const measureScenarioRun = async ({
  page,
  session,
  durationMs,
  triggerBursts,
}) => {
  const before = await readCdpMetrics(session);
  const frameProbe = await collectFrameProbe(page, durationMs, triggerBursts);
  const after = await readCdpMetrics(session);

  return {
    raf: {
      ...summarizeFrames(frameProbe),
      peakBurstCount: frameProbe.peakBurstCount,
      peakDomParticleCount: frameProbe.peakDomParticleCount,
      peakParticleCount: frameProbe.peakParticleCount,
    },
    mainThread: subtractMetrics(before, after),
  };
};

const measureTraceRun = async ({
  page,
  session,
  durationMs,
  triggerBursts,
}) => {
  await startTrace(session);
  const frameProbe = await collectFrameProbe(page, durationMs, triggerBursts);
  const presentation = await stopTrace(session);
  return {
    presentation,
    workload: {
      peakBurstCount: frameProbe.peakBurstCount,
      peakDomParticleCount: frameProbe.peakDomParticleCount,
      peakParticleCount: frameProbe.peakParticleCount,
    },
  };
};

const summarizeGroup = (runs, group) => {
  const fields = Object.keys(runs[0]?.[group] ?? {});
  return Object.fromEntries(
    fields.map((field) => [
      field,
      median(runs.map((run) => run[group][field])),
    ]),
  );
};

const summarizeDispersion = (runs, group) => {
  const fields = Object.keys(runs[0]?.[group] ?? {});
  return Object.fromEntries(
    fields.map((field) => {
      const values = runs.map((run) => run[group][field]);
      return [
        field,
        {
          min: Math.min(...values),
          median: median(values),
          max: Math.max(...values),
        },
      ];
    }),
  );
};

const summarizeScenario = (durationMs, runs, traceRun) => ({
  durationMs,
  repetitions: runs.length,
  raf: summarizeGroup(runs, "raf"),
  mainThread: summarizeGroup(runs, "mainThread"),
  presentation: traceRun.presentation,
  traceWorkload: traceRun.workload,
  dispersion: {
    raf: summarizeDispersion(runs, "raf"),
    mainThread: summarizeDispersion(runs, "mainThread"),
  },
  runs,
});

const readRendererStack = (page) =>
  page.evaluate(() => {
    const canvas = document.querySelector("canvas[data-renderer]");
    const gemRenderer = document.querySelector("[data-gem-renderer]");
    const particleRenderer = document.querySelector("[data-particle-renderer]");
    return {
      background:
        canvas instanceof HTMLElement
          ? (canvas.dataset.renderer ?? "unknown")
          : "unknown",
      gems:
        gemRenderer instanceof HTMLElement
          ? (gemRenderer.dataset.gemRenderer ?? "unknown")
          : "unknown",
      particles:
        particleRenderer instanceof HTMLElement
          ? (particleRenderer.dataset.particleRenderer ?? "unknown")
          : "unknown",
    };
  });

const readFixtureLayout = (page) =>
  page.evaluate(() => {
    const board = document.querySelector('[role="grid"]');
    const canvas = document.querySelector("canvas[data-renderer]");
    const panel = canvas?.parentElement;
    if (
      !(board instanceof HTMLElement) ||
      !(canvas instanceof HTMLCanvasElement) ||
      !(panel instanceof HTMLElement)
    ) {
      throw new Error("Performance fixture layout elements are missing");
    }
    const boardRect = board.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    return {
      board: { width: boardRect.width, height: boardRect.height },
      canvas: { width: canvasRect.width, height: canvasRect.height },
      panel: { width: panelRect.width, height: panelRect.height },
    };
  });

const readWebGpuAdapter = (page) =>
  page.evaluate(async () => {
    if (!("gpu" in navigator)) return { supported: false, adapter: null };
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return { supported: true, adapter: null };
    const {
      architecture,
      description,
      device,
      subgroupMaxSize,
      subgroupMinSize,
      vendor,
    } = adapter.info;
    return {
      supported: true,
      adapter: {
        architecture,
        description,
        device,
        subgroupMaxSize,
        subgroupMinSize,
        vendor,
      },
    };
  });

const isSoftwareGpu = (gpu, webGpu) =>
  JSON.stringify({ gpu, webGpu }).toLowerCase().includes("swiftshader") ||
  JSON.stringify({ gpu, webGpu }).toLowerCase().includes("llvmpipe");

test("records a comparable rendering baseline", async ({ browser }) => {
  assertPositiveNumber(CPU_THROTTLE_RATE, "PERF_CPU_THROTTLE");
  assertPositiveNumber(IDLE_DURATION_MS, "PERF_IDLE_DURATION_MS");
  assertPositiveNumber(REPETITIONS, "PERF_REPETITIONS");
  if (!Number.isInteger(REPETITIONS)) {
    throw new Error("PERF_REPETITIONS must be an integer");
  }

  const status = execFileSync("git", ["status", "--porcelain=v1"], {
    encoding: "utf8",
  });
  const dirty = status.trim() !== "";
  if (dirty && process.env.PERF_ALLOW_DIRTY !== "1") {
    throw new Error(
      "Refusing to record a baseline from a dirty tree; set PERF_ALLOW_DIRTY=1 for local harness validation",
    );
  }
  const sourceHash = createHash("sha256")
    .update(
      execFileSync("git", ["diff", "HEAD", "--binary"], { encoding: "utf8" }),
    )
    .update(status);
  const untrackedPaths = execFileSync(
    "git",
    ["ls-files", "--others", "--exclude-standard", "-z"],
    { encoding: "utf8" },
  )
    .split("\0")
    .filter(Boolean)
    .sort();
  for (const untrackedPath of untrackedPaths) {
    sourceHash.update(untrackedPath).update(readFileSync(untrackedPath));
  }
  const sourceFingerprint = sourceHash.digest("hex");

  const page = await browser.newPage({
    deviceScaleFactor: 1,
    reducedMotion: "no-preference",
    viewport: { width: 1280, height: 900 },
  });
  await page.addInitScript((seed) => {
    let state = seed >>> 0;
    Math.random = () => {
      state += 0x6d2b79f5;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }, RANDOM_SEED);

  const session = await page.context().newCDPSession(page);
  const browserSession = await browser.newBrowserCDPSession();
  await session.send("Performance.enable");
  await session.send("Emulation.setCPUThrottlingRate", {
    rate: CPU_THROTTLE_RATE,
  });

  const loadFixture = async (busy) => {
    const query = busy ? "?busy=1" : "";
    await page.goto(`/performance.html${query}`);
    await page.waitForLoadState("networkidle");
    await expect(
      page.locator('canvas[data-renderer][data-renderer-status="ready"]'),
    ).toBeVisible();
    await page.waitForTimeout(500);
  };

  await loadFixture(false);
  const rendererStack = await readRendererStack(page);
  const fixtureLayout = await readFixtureLayout(page);
  expect(fixtureLayout.board.width).toBeGreaterThan(300);
  expect(
    Math.abs(fixtureLayout.board.width - fixtureLayout.board.height),
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(fixtureLayout.canvas.width - fixtureLayout.panel.width),
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(fixtureLayout.canvas.height - fixtureLayout.panel.height),
  ).toBeLessThanOrEqual(1);
  const fixtureContract = await page
    .getByTestId("trigger-bursts")
    .evaluate((trigger) => ({
      burstDurationMs: Number(trigger.dataset.burstDurationMs),
      expectedBurstCount: Number(trigger.dataset.expectedBurstCount),
      expectedParticleCount: Number(trigger.dataset.expectedParticleCount),
      particleRandomSeed: Number(trigger.dataset.particleRandomSeed),
    }));
  assertPositiveNumber(
    fixtureContract.burstDurationMs,
    "fixture burst duration",
  );

  const runScenario = async ({ busy, durationMs, triggerBursts }) => {
    await loadFixture(busy);
    await measureScenarioRun({
      page,
      session,
      durationMs,
      triggerBursts,
    });

    const runs = [];
    for (let repetition = 0; repetition < REPETITIONS; repetition++) {
      await loadFixture(busy);
      runs.push(
        await measureScenarioRun({
          page,
          session,
          durationMs,
          triggerBursts,
        }),
      );
    }
    await loadFixture(busy);
    const traceRun = await measureTraceRun({
      page,
      session,
      durationMs,
      triggerBursts,
    });
    return summarizeScenario(durationMs, runs, traceRun);
  };

  const idle = await runScenario({
    busy: false,
    durationMs: IDLE_DURATION_MS,
    triggerBursts: false,
  });
  const burst = await runScenario({
    busy: true,
    durationMs: fixtureContract.burstDurationMs,
    triggerBursts: true,
  });

  const assertBurstWorkload = (workload) => {
    expect(workload.peakBurstCount).toBe(fixtureContract.expectedBurstCount);
    expect(workload.peakParticleCount).toBe(
      fixtureContract.expectedParticleCount,
    );
    if (rendererStack.particles === "dom") {
      expect(workload.peakDomParticleCount).toBe(
        fixtureContract.expectedParticleCount,
      );
    }
  };
  for (const run of burst.runs) {
    assertBurstWorkload(run.raf);
  }
  assertBurstWorkload(burst.traceWorkload);

  const { gpu } = await browserSession.send("SystemInfo.getInfo");
  const gpuInfo = {
    devices: gpu.devices,
    auxAttributes: gpu.auxAttributes,
    featureStatus: gpu.featureStatus,
    driverBugWorkarounds: gpu.driverBugWorkarounds,
  };
  const webGpu = await readWebGpuAdapter(page);
  const softwareGpu = isSoftwareGpu(gpuInfo, webGpu);
  const usesWebGpu = Object.values(rendererStack).includes("webgpu");
  if (usesWebGpu) {
    expect(webGpu.adapter).not.toBeNull();
    if (softwareGpu && process.env.PERF_ALLOW_SOFTWARE_GPU !== "1") {
      throw new Error(
        "Refusing to benchmark WebGPU through a software adapter; set PERF_ALLOW_SOFTWARE_GPU=1 to override",
      );
    }
  }

  const revision = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  const variant = [
    `${rendererStack.background}-background`,
    `${rendererStack.gems}-gems`,
    `${rendererStack.particles}-particles`,
  ].join("_");
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    revision,
    source: { revision, dirty, sourceFingerprint },
    renderer: rendererStack.background,
    renderers: rendererStack,
    variant,
    browserVersion: await browser.version(),
    benchmark: {
      buildMode: "production-preview",
      cpuThrottleRate: CPU_THROTTLE_RATE,
      deviceScaleFactor: 1,
      frameBudgetMs: FRAME_BUDGET_MS,
      headless: process.env.PERF_HEADLESS !== "0",
      layout: fixtureLayout,
      randomSeed: RANDOM_SEED,
      repetitions: REPETITIONS,
      traceRepetitions: 1,
      viewport: { width: 1280, height: 900 },
      workload: fixtureContract,
    },
    environment: {
      platform: os.platform(),
      release: os.release(),
      architecture: os.arch(),
      cpu: os.cpus()[0]?.model ?? "unknown",
      gpu: gpuInfo,
      softwareGpu,
      webGpu,
    },
    scenarios: { idle, burst },
  };

  const outputDirectory = path.resolve("performance-results");
  const outputPath = path.join(outputDirectory, `${variant}.json`);
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log(`Rendering performance report: ${outputPath}`);
  console.log(JSON.stringify(report, null, 2));

  expect(idle.raf.sampleCount).toBeGreaterThan(0);
  expect(burst.raf.sampleCount).toBeGreaterThan(0);
  expect(idle.presentation.traceDataLoss).toBe(0);
  expect(burst.presentation.traceDataLoss).toBe(0);
  expect(idle.presentation.drawFrameCount).toBeGreaterThan(0);
  expect(burst.presentation.drawFrameCount).toBeGreaterThan(0);
});
