const SHARED_THRESHOLDS = Object.freeze({
  "mainThread.LayoutDurationMs": {
    maxAbsoluteIncrease: 1,
    maxRegressionPercent: 20,
  },
  "mainThread.RecalcStyleDurationMs": {
    maxAbsoluteIncrease: 1,
    maxRegressionPercent: 20,
  },
  "mainThread.ScriptDurationMs": {
    maxAbsoluteIncrease: 2,
    maxRegressionPercent: 15,
  },
  "mainThread.TaskDurationMs": {
    maxAbsoluteIncrease: 2,
    maxRegressionPercent: 15,
  },
  "raf.longTaskDurationMs": {
    maxAbsoluteIncrease: 50,
    maxRegressionPercent: 20,
  },
  "raf.meanFrameIntervalMs": {
    maxAbsoluteIncrease: 1,
    maxRegressionPercent: 10,
  },
  "raf.overBudgetFrameRatio": {
    maxAbsoluteIncrease: 0.03,
    maxRegressionPercent: 20,
  },
  "raf.p50FrameIntervalMs": {
    maxAbsoluteIncrease: 1,
    maxRegressionPercent: 10,
  },
  "raf.p95FrameIntervalMs": {
    maxAbsoluteIncrease: 2,
    maxRegressionPercent: 15,
  },
  "raf.p99FrameIntervalMs": {
    maxAbsoluteIncrease: 3,
    maxRegressionPercent: 20,
  },
});

export const PERFORMANCE_PROFILES = Object.freeze({
  "cpu-stress": Object.freeze({
    browserChannel: null,
    cpuThrottleRate: 4,
    description: "Headless Chromium with 4x CPU throttling",
    deviceScaleFactor: 1,
    frameBudgetMs: 25,
    headless: true,
    idleDurationMs: 3000,
    name: "cpu-stress",
    randomSeed: 0x5eed1234,
    regressionThresholds: SHARED_THRESHOLDS,
    repetitions: 5,
    traceRepetitions: 1,
    version: 1,
    viewport: Object.freeze({ height: 900, width: 1280 }),
  }),
  "hardware-gpu": Object.freeze({
    browserChannel: "chrome",
    cpuThrottleRate: 1,
    description: "Headed stable Chrome with hardware GPU acceleration",
    deviceScaleFactor: 1,
    frameBudgetMs: 25,
    headless: false,
    idleDurationMs: 5000,
    name: "hardware-gpu",
    randomSeed: 0x5eed1234,
    regressionThresholds: SHARED_THRESHOLDS,
    repetitions: 7,
    traceRepetitions: 1,
    version: 1,
    viewport: Object.freeze({ height: 900, width: 1280 }),
  }),
});

export const getPerformanceProfile = (name) => {
  if (!Object.hasOwn(PERFORMANCE_PROFILES, name)) {
    throw new Error(
      `Unknown performance profile "${name}". Expected one of: ${Object.keys(
        PERFORMANCE_PROFILES,
      ).join(", ")}`,
    );
  }
  return PERFORMANCE_PROFILES[name];
};
