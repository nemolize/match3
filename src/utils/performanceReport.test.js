import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { getPerformanceProfile } from "../../performance-tests/profiles.mjs";
import {
  acceptPerformanceReport,
  comparePerformanceReports,
  createEnvironmentFingerprint,
  selectPerformanceBaseline,
} from "../../scripts/performance-report.mjs";

const createScenario = (configuredDurationMs) => ({
  configuredDurationMs,
  gpuTimings: Array.from({ length: 5 }, () => ({
    passes: {},
    reason: "renderer-timing-api-unavailable",
    supported: false,
  })),
  measuredDurationMs: configuredDurationMs + 16,
  mainThread: {
    LayoutDurationMs: 2,
    RecalcStyleDurationMs: 2,
    ScriptDurationMs: 10,
    TaskDurationMs: 20,
  },
  raf: {
    longTaskDurationMs: 0,
    meanFrameIntervalMs: 16,
    overBudgetFrameRatio: 0.01,
    p50FrameIntervalMs: 16,
    p95FrameIntervalMs: 18,
    p99FrameIntervalMs: 20,
  },
  repetitions: 5,
  runs: Array.from({ length: 5 }, () => ({})),
});

const createReport = (id) => {
  const profile = getPerformanceProfile("cpu-stress");
  const report = {
    benchmark: {
      buildMode: "production-preview",
      cpuThrottleRate: profile.cpuThrottleRate,
      deviceScaleFactor: profile.deviceScaleFactor,
      frameBudgetMs: profile.frameBudgetMs,
      headless: profile.headless,
      layout: {
        board: { height: 384, width: 384 },
        canvas: { height: 416, width: 416 },
        panel: { height: 416, width: 416 },
      },
      randomSeed: profile.randomSeed,
      regressionThresholds: profile.regressionThresholds,
      repetitions: profile.repetitions,
      traceRepetitions: profile.traceRepetitions,
      viewport: profile.viewport,
      workload: {
        burstDurationMs: 600,
        expectedBurstCount: 12,
        expectedParticleCount: 96,
        particleRandomSeed: 2343432205,
      },
    },
    browserVersion: "Test Chrome 1",
    environment: {
      architecture: "arm64",
      cpu: "Test CPU",
      fingerprint: "",
      gpu: {
        auxAttributes: {
          displayType: "ANGLE",
          glRenderer: "Test GPU",
          glVendor: "Test Vendor",
          glVersion: "1",
          skiaBackendType: "GaneshGL",
        },
        devices: [{ deviceString: "Test GPU" }],
        featureStatus: { webgpu: "enabled" },
      },
      platform: "darwin",
      release: "1",
      softwareGpu: false,
      webGpu: { adapter: null, supported: true },
    },
    generatedAt: "2026-07-27T00:00:00.000Z",
    id,
    profile: {
      description: profile.description,
      name: profile.name,
      version: profile.version,
    },
    renderers: {
      background: "canvas2d",
      gems: "dom",
      particles: "dom",
    },
    revision: "abc123",
    scenarios: {
      burst: createScenario(600),
      idle: createScenario(3000),
    },
    schemaVersion: 3,
    source: {
      dirty: false,
      revision: "abc123",
      sourceFingerprint: "fingerprint",
    },
    variant: "canvas2d-background_dom-gems_dom-particles",
  };
  report.environment.fingerprint = createEnvironmentFingerprint(
    report.environment,
  );
  return report;
};

describe("comparePerformanceReports", () => {
  it("rejects incompatible benchmark environments", () => {
    const baseline = createReport("baseline");
    const candidate = createReport("candidate");
    candidate.browserVersion = "Different Chrome";

    expect(() => comparePerformanceReports(baseline, candidate)).toThrow(
      /browserVersion/,
    );
  });

  it("reports metrics that exceed their regression thresholds", () => {
    const baseline = createReport("baseline");
    const candidate = createReport("candidate");
    candidate.scenarios.burst.raf.p95FrameIntervalMs = 30;

    const comparison = comparePerformanceReports(baseline, candidate);

    expect(comparison.passed).toBe(false);
    expect(comparison.regressions).toContain("burst.raf.p95FrameIntervalMs");
  });

  it("uses the larger absolute or relative allowance without adding them", () => {
    const baseline = createReport("baseline");
    const candidate = createReport("candidate");
    baseline.scenarios.burst.raf.p95FrameIntervalMs = 20;
    candidate.scenarios.burst.raf.p95FrameIntervalMs = 23.1;

    const comparison = comparePerformanceReports(baseline, candidate);
    const result = comparison.scenarios.burst["raf.p95FrameIntervalMs"];

    expect(result.allowedIncrease).toBe(3);
    expect(result.regression).toBe(true);
  });

  it("returns exploratory output for an additional candidate scenario", () => {
    const baseline = createReport("baseline");
    const candidate = createReport("candidate");
    candidate.scenarios.refraction = createScenario(3000);

    const comparison = comparePerformanceReports(baseline, candidate, {
      allowIncompatible: true,
    });

    expect(comparison.compatible).toBe(false);
    expect(comparison.incompatibilities).toContain("scenarios");
    expect(Object.keys(comparison.scenarios)).toEqual(["burst", "idle"]);
  });

  it("requires renderer-owned WebGPU passes when timestamp queries exist", () => {
    const baseline = createReport("baseline");
    baseline.renderers.background = "webgpu";
    baseline.environment.webGpu.adapter = {
      features: ["timestamp-query"],
    };
    baseline.environment.fingerprint = createEnvironmentFingerprint(
      baseline.environment,
    );
    for (const scenario of Object.values(baseline.scenarios)) {
      scenario.gpuTimings = scenario.gpuTimings.map(() => ({
        passes: {
          backgroundCaustics: { durationNs: 10, sampleCount: 1 },
          composite: { durationNs: 10, sampleCount: 1 },
          fragments: { durationNs: 10, sampleCount: 1 },
          gemRefraction: { durationNs: 10, sampleCount: 1 },
        },
        supported: true,
        timestampPeriodNs: 1,
      }));
    }

    expect(() => comparePerformanceReports(baseline, baseline)).toThrow(
      /waveSimulation/,
    );
  });

  it("accepts schema 2 WebGPU reports without wave simulation timings", () => {
    const report = createReport("legacy-webgpu");
    report.schemaVersion = 2;
    report.renderers.background = "webgpu";
    report.environment.webGpu.adapter = {
      features: ["timestamp-query"],
    };
    report.environment.fingerprint = createEnvironmentFingerprint(
      report.environment,
    );
    for (const [scenarioName, scenario] of Object.entries(report.scenarios)) {
      scenario.gpuTimings = scenario.gpuTimings.map(() => ({
        passes: {
          backgroundCaustics: { durationNs: 10, sampleCount: 1 },
          composite: { durationNs: 10, sampleCount: 1 },
          fragments:
            scenarioName === "idle"
              ? { durationNs: 0, sampleCount: 0, status: "inactive" }
              : { durationNs: 10, sampleCount: 1 },
          gemRefraction: { durationNs: 10, sampleCount: 1 },
        },
        supported: true,
        timestampPeriodNs: 1,
      }));
    }

    expect(comparePerformanceReports(report, report).passed).toBe(true);
  });

  it("allows an explicitly inactive fragment pass during idle", () => {
    const report = createReport("webgpu");
    report.renderers.background = "webgpu";
    report.environment.webGpu.adapter = {
      features: ["timestamp-query"],
    };
    report.environment.fingerprint = createEnvironmentFingerprint(
      report.environment,
    );
    for (const [scenarioName, scenario] of Object.entries(report.scenarios)) {
      scenario.gpuTimings = scenario.gpuTimings.map(() => ({
        passes: {
          backgroundCaustics: { durationNs: 10, sampleCount: 1 },
          composite: { durationNs: 10, sampleCount: 1 },
          fragments:
            scenarioName === "idle"
              ? { durationNs: 0, sampleCount: 0, status: "inactive" }
              : { durationNs: 10, sampleCount: 1 },
          gemRefraction: { durationNs: 10, sampleCount: 1 },
          waveSimulation: { durationNs: 10, sampleCount: 1 },
        },
        supported: true,
        timestampPeriodNs: 1,
      }));
    }

    expect(comparePerformanceReports(report, report).passed).toBe(true);
  });

  it("keeps self-contained historical profile reports comparable", () => {
    const baseline = createReport("baseline");
    const candidate = createReport("candidate");
    for (const report of [baseline, candidate]) {
      report.profile = {
        description: "Historical profile",
        name: "historical-cpu-stress",
        version: 7,
      };
    }

    expect(comparePerformanceReports(baseline, candidate).passed).toBe(true);
  });
});

describe("performance baseline store", () => {
  it("rejects structurally incomplete reports", () => {
    const repositoryRoot = mkdtempSync(
      path.join(os.tmpdir(), "match3-performance-invalid-"),
    );
    const invalidInputPath = path.join(repositoryRoot, "invalid.json");
    const invalidReport = createReport("invalid");
    delete invalidReport.environment.gpu;
    writeFileSync(invalidInputPath, JSON.stringify(invalidReport));

    expect(() =>
      acceptPerformanceReport({
        reportPath: invalidInputPath,
        repositoryRoot,
        role: "baseline",
      }),
    ).toThrow(/environment.gpu/);
  });

  it("rejects reports that redefine their named profile", () => {
    const repositoryRoot = mkdtempSync(
      path.join(os.tmpdir(), "match3-performance-profile-"),
    );
    const inputPath = path.join(repositoryRoot, "profile.json");
    const report = createReport("profile");
    report.benchmark.cpuThrottleRate = 1;
    writeFileSync(inputPath, JSON.stringify(report));

    expect(() =>
      acceptPerformanceReport({
        reportPath: inputPath,
        repositoryRoot,
        role: "baseline",
      }),
    ).toThrow(/profile contract/);
  });

  it("rejects dirty and duplicate reports", () => {
    const repositoryRoot = mkdtempSync(
      path.join(os.tmpdir(), "match3-performance-validation-"),
    );
    const dirtyInputPath = path.join(repositoryRoot, "dirty.json");
    const cleanInputPath = path.join(repositoryRoot, "clean.json");
    const dirtyReport = createReport("dirty");
    dirtyReport.source.dirty = true;
    writeFileSync(dirtyInputPath, JSON.stringify(dirtyReport));
    writeFileSync(cleanInputPath, JSON.stringify(createReport("clean")));

    expect(() =>
      acceptPerformanceReport({
        reportPath: dirtyInputPath,
        repositoryRoot,
        role: "baseline",
      }),
    ).toThrow(/Dirty-tree/);
    acceptPerformanceReport({
      reportPath: cleanInputPath,
      repositoryRoot,
      role: "baseline",
    });
    expect(() =>
      acceptPerformanceReport({
        reportPath: cleanInputPath,
        repositoryRoot,
        role: "candidate",
      }),
    ).toThrow(/already accepted/);
  });

  it("preserves baseline history and can reselect an earlier baseline", () => {
    const repositoryRoot = mkdtempSync(
      path.join(os.tmpdir(), "match3-performance-store-"),
    );
    const firstInputPath = path.join(repositoryRoot, "first.json");
    const secondInputPath = path.join(repositoryRoot, "second.json");
    writeFileSync(
      firstInputPath,
      JSON.stringify(createReport("baseline-first")),
    );
    writeFileSync(
      secondInputPath,
      JSON.stringify(createReport("baseline-second")),
    );

    acceptPerformanceReport({
      now: "2026-07-27T00:01:00.000Z",
      reportPath: firstInputPath,
      repositoryRoot,
      role: "baseline",
    });
    expect(() =>
      acceptPerformanceReport({
        reportPath: secondInputPath,
        repositoryRoot,
        role: "baseline",
      }),
    ).toThrow(/--replace-baseline/);
    acceptPerformanceReport({
      now: "2026-07-27T00:02:00.000Z",
      replaceBaseline: true,
      reportPath: secondInputPath,
      repositoryRoot,
      role: "baseline",
    });
    selectPerformanceBaseline({
      now: "2026-07-27T00:03:00.000Z",
      profile: "cpu-stress",
      reportId: "baseline-first",
      repositoryRoot,
    });

    const index = JSON.parse(
      readFileSync(
        path.join(repositoryRoot, "performance-baselines/index.json"),
        "utf8",
      ),
    );
    expect(index.reports).toHaveLength(2);
    const environmentFingerprint =
      createReport("fingerprint").environment.fingerprint;
    expect(
      index.selectedBaselines[`cpu-stress::${environmentFingerprint}`],
    ).toBe("baseline-first");
    expect(index.selectionHistory.map(({ reportId }) => reportId)).toEqual([
      "baseline-first",
      "baseline-second",
      "baseline-first",
    ]);
  });

  it("stores a passing candidate and its compact comparison", () => {
    const repositoryRoot = mkdtempSync(
      path.join(os.tmpdir(), "match3-performance-candidate-"),
    );
    const baselineInputPath = path.join(repositoryRoot, "baseline.json");
    const candidateInputPath = path.join(repositoryRoot, "candidate.json");
    writeFileSync(baselineInputPath, JSON.stringify(createReport("baseline")));
    const candidate = createReport("candidate");
    candidate.revision = "def456";
    candidate.source.revision = "def456";
    writeFileSync(candidateInputPath, JSON.stringify(candidate));

    acceptPerformanceReport({
      reportPath: baselineInputPath,
      repositoryRoot,
      role: "baseline",
    });
    const accepted = acceptPerformanceReport({
      reportPath: candidateInputPath,
      repositoryRoot,
      role: "candidate",
    });

    expect(accepted.comparison.passed).toBe(true);
    const index = JSON.parse(
      readFileSync(
        path.join(repositoryRoot, "performance-baselines/index.json"),
        "utf8",
      ),
    );
    expect(index.comparisons).toEqual([
      expect.objectContaining({
        baselineId: "baseline",
        candidateId: "candidate",
        passed: true,
      }),
    ]);
  });
});
