import { createHash } from "node:crypto";
import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";

import { getPerformanceProfile } from "../performance-tests/profiles.mjs";

const ENVIRONMENT_COMPATIBILITY_PATHS = [
  "environment.platform",
  "environment.release",
  "environment.architecture",
  "environment.cpu",
  "environment.gpu.devices",
  "environment.gpu.featureStatus",
  "environment.gpu.auxAttributes.displayType",
  "environment.gpu.auxAttributes.glRenderer",
  "environment.gpu.auxAttributes.glVendor",
  "environment.gpu.auxAttributes.glVersion",
  "environment.gpu.auxAttributes.skiaBackendType",
  "environment.softwareGpu",
  "environment.webGpu",
];

const COMPATIBILITY_PATHS = [
  "browserVersion",
  "profile.name",
  "profile.version",
  "benchmark.buildMode",
  "benchmark.cpuThrottleRate",
  "benchmark.deviceScaleFactor",
  "benchmark.frameBudgetMs",
  "benchmark.headless",
  "benchmark.layout",
  "benchmark.randomSeed",
  "benchmark.regressionThresholds",
  "benchmark.repetitions",
  "benchmark.traceRepetitions",
  "benchmark.viewport",
  "benchmark.workload",
  "environment.fingerprint",
  ...ENVIRONMENT_COMPATIBILITY_PATHS,
];

const METRIC_PATHS = [
  "mainThread.LayoutDurationMs",
  "mainThread.RecalcStyleDurationMs",
  "mainThread.ScriptDurationMs",
  "mainThread.TaskDurationMs",
  "raf.longTaskDurationMs",
  "raf.meanFrameIntervalMs",
  "raf.overBudgetFrameRatio",
  "raf.p50FrameIntervalMs",
  "raf.p95FrameIntervalMs",
  "raf.p99FrameIntervalMs",
];

const REQUIRED_SCENARIOS = ["burst", "idle"];
const REQUIRED_WEBGPU_PASSES = [
  "backgroundCaustics",
  "composite",
  "fragments",
  "gemRefraction",
];

const canonicalJson = (value) => {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

const readPath = (value, pathValue) =>
  pathValue.split(".").reduce((current, key) => current?.[key], value);

export const createEnvironmentFingerprint = (environment) =>
  createHash("sha256")
    .update(
      canonicalJson(
        Object.fromEntries(
          ENVIRONMENT_COMPATIBILITY_PATHS.map((pathValue) => [
            pathValue,
            readPath({ environment }, pathValue),
          ]),
        ),
      ),
    )
    .digest("hex")
    .slice(0, 16);

const readReport = (reportPath) => JSON.parse(readFileSync(reportPath, "utf8"));

const assertObject = (value, pathValue) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${pathValue} must be an object`);
  }
};

const assertString = (value, pathValue) => {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${pathValue} must be a non-empty string`);
  }
};

const assertBoolean = (value, pathValue) => {
  if (typeof value !== "boolean") {
    throw new Error(`${pathValue} must be a boolean`);
  }
};

const assertFiniteNumber = (value, pathValue, minimum = 0) => {
  if (!Number.isFinite(value) || value < minimum) {
    throw new Error(`${pathValue} must be a finite number >= ${minimum}`);
  }
};

const validateGpuTimingCoverage = (report, label) => {
  const usesWebGpu = Object.values(report.renderers).includes("webgpu");
  const adapterFeatures = report.environment.webGpu.adapter?.features ?? [];
  if (!usesWebGpu || !adapterFeatures.includes("timestamp-query")) return;

  for (const [scenarioName, scenario] of Object.entries(report.scenarios)) {
    for (const [runIndex, timing] of scenario.gpuTimings.entries()) {
      if (timing?.supported !== true) {
        throw new Error(
          `${label}.scenarios.${scenarioName}.gpuTimings[${runIndex}] must be supported when timestamp-query is available`,
        );
      }
      assertObject(
        timing.passes,
        `${label}.scenarios.${scenarioName}.gpuTimings[${runIndex}].passes`,
      );
      assertFiniteNumber(
        timing.timestampPeriodNs,
        `${label}.scenarios.${scenarioName}.gpuTimings[${runIndex}].timestampPeriodNs`,
        Number.MIN_VALUE,
      );
      for (const passName of REQUIRED_WEBGPU_PASSES) {
        const pass = timing.passes[passName];
        assertObject(
          pass,
          `${label}.scenarios.${scenarioName}.gpuTimings[${runIndex}].passes.${passName}`,
        );
        assertFiniteNumber(
          pass.durationNs,
          `${label}.scenarios.${scenarioName}.gpuTimings[${runIndex}].passes.${passName}.durationNs`,
        );
        const pathValue = `${label}.scenarios.${scenarioName}.gpuTimings[${runIndex}].passes.${passName}`;
        const mayBeInactive =
          scenarioName === "idle" && passName === "fragments";
        const isInactive =
          pass.status === "inactive" &&
          pass.durationNs === 0 &&
          pass.sampleCount === 0;
        if (mayBeInactive && isInactive) continue;
        assertFiniteNumber(pass.sampleCount, `${pathValue}.sampleCount`, 1);
        if (!Number.isInteger(pass.sampleCount)) {
          throw new Error(`${pathValue}.sampleCount must be an integer`);
        }
      }
    }
  }
};

const assertDimensions = (value, pathValue) => {
  assertObject(value, pathValue);
  assertFiniteNumber(value.width, `${pathValue}.width`, Number.MIN_VALUE);
  assertFiniteNumber(value.height, `${pathValue}.height`, Number.MIN_VALUE);
};

const assertInteger = (value, pathValue, minimum = 0) => {
  assertFiniteNumber(value, pathValue, minimum);
  if (!Number.isInteger(value)) {
    throw new Error(`${pathValue} must be an integer`);
  }
};

export const validatePerformanceReport = (
  report,
  label = "Report",
  { requireCurrentProfile = false } = {},
) => {
  assertObject(report, label);
  if (report.schemaVersion !== 2) {
    throw new Error(`${label} uses unsupported performance report schema`);
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(report.id ?? "")) {
    throw new Error(`${label}.id is invalid`);
  }
  assertString(report.generatedAt, `${label}.generatedAt`);
  assertObject(report.profile, `${label}.profile`);
  assertString(report.profile.name, `${label}.profile.name`);
  assertInteger(report.profile.version, `${label}.profile.version`, 1);
  assertString(report.profile.description, `${label}.profile.description`);
  assertString(report.revision, `${label}.revision`);
  assertObject(report.source, `${label}.source`);
  assertString(report.source.revision, `${label}.source.revision`);
  if (report.revision !== report.source.revision) {
    throw new Error(`${label}.revision must match source.revision`);
  }
  assertBoolean(report.source.dirty, `${label}.source.dirty`);
  assertString(
    report.source.sourceFingerprint,
    `${label}.source.sourceFingerprint`,
  );
  assertString(report.variant, `${label}.variant`);
  assertString(report.browserVersion, `${label}.browserVersion`);
  assertObject(report.renderers, `${label}.renderers`);
  for (const rendererName of ["background", "gems", "particles"]) {
    assertString(
      report.renderers[rendererName],
      `${label}.renderers.${rendererName}`,
    );
  }

  assertObject(report.benchmark, `${label}.benchmark`);
  assertString(report.benchmark.buildMode, `${label}.benchmark.buildMode`);
  for (const numericField of [
    "cpuThrottleRate",
    "deviceScaleFactor",
    "frameBudgetMs",
    "randomSeed",
  ]) {
    assertFiniteNumber(
      report.benchmark[numericField],
      `${label}.benchmark.${numericField}`,
    );
  }
  assertInteger(
    report.benchmark.repetitions,
    `${label}.benchmark.repetitions`,
    1,
  );
  assertInteger(
    report.benchmark.traceRepetitions,
    `${label}.benchmark.traceRepetitions`,
    1,
  );
  assertBoolean(report.benchmark.headless, `${label}.benchmark.headless`);
  assertObject(report.benchmark.layout, `${label}.benchmark.layout`);
  for (const layoutElement of ["board", "canvas", "panel"]) {
    assertDimensions(
      report.benchmark.layout[layoutElement],
      `${label}.benchmark.layout.${layoutElement}`,
    );
  }
  assertDimensions(report.benchmark.viewport, `${label}.benchmark.viewport`);
  assertObject(report.benchmark.workload, `${label}.benchmark.workload`);
  assertObject(
    report.benchmark.regressionThresholds,
    `${label}.benchmark.regressionThresholds`,
  );
  for (const metricPath of METRIC_PATHS) {
    const threshold = report.benchmark.regressionThresholds[metricPath];
    assertObject(
      threshold,
      `${label}.benchmark.regressionThresholds.${metricPath}`,
    );
    assertFiniteNumber(
      threshold.maxAbsoluteIncrease,
      `${label}.benchmark.regressionThresholds.${metricPath}.maxAbsoluteIncrease`,
    );
    assertFiniteNumber(
      threshold.maxRegressionPercent,
      `${label}.benchmark.regressionThresholds.${metricPath}.maxRegressionPercent`,
    );
  }
  assertFiniteNumber(
    report.benchmark.workload.burstDurationMs,
    `${label}.benchmark.workload.burstDurationMs`,
    Number.MIN_VALUE,
  );
  for (const field of [
    "expectedBurstCount",
    "expectedParticleCount",
    "particleRandomSeed",
  ]) {
    assertInteger(
      report.benchmark.workload[field],
      `${label}.benchmark.workload.${field}`,
      1,
    );
  }

  assertObject(report.environment, `${label}.environment`);
  for (const stringField of [
    "architecture",
    "cpu",
    "fingerprint",
    "platform",
    "release",
  ]) {
    assertString(
      report.environment[stringField],
      `${label}.environment.${stringField}`,
    );
  }
  assertBoolean(
    report.environment.softwareGpu,
    `${label}.environment.softwareGpu`,
  );
  assertObject(report.environment.gpu, `${label}.environment.gpu`);
  if (!Array.isArray(report.environment.gpu.devices)) {
    throw new Error(`${label}.environment.gpu.devices must be an array`);
  }
  assertObject(
    report.environment.gpu.auxAttributes,
    `${label}.environment.gpu.auxAttributes`,
  );
  assertObject(
    report.environment.gpu.featureStatus,
    `${label}.environment.gpu.featureStatus`,
  );
  assertObject(report.environment.webGpu, `${label}.environment.webGpu`);
  assertBoolean(
    report.environment.webGpu.supported,
    `${label}.environment.webGpu.supported`,
  );
  const adapter = report.environment.webGpu.adapter;
  if (adapter !== null) {
    assertObject(adapter, `${label}.environment.webGpu.adapter`);
    if (!Array.isArray(adapter.features)) {
      throw new Error(
        `${label}.environment.webGpu.adapter.features must be an array`,
      );
    }
  }
  const expectedFingerprint = createEnvironmentFingerprint(report.environment);
  if (report.environment.fingerprint !== expectedFingerprint) {
    throw new Error(`${label}.environment.fingerprint does not match`);
  }

  assertObject(report.scenarios, `${label}.scenarios`);
  const scenarioNames = Object.keys(report.scenarios).sort();
  if (
    REQUIRED_SCENARIOS.some(
      (scenarioName) => !scenarioNames.includes(scenarioName),
    )
  ) {
    throw new Error(
      `${label}.scenarios must include ${REQUIRED_SCENARIOS.join(", ")}`,
    );
  }
  for (const [scenarioName, scenario] of Object.entries(report.scenarios)) {
    assertObject(scenario, `${label}.scenarios.${scenarioName}`);
    assertFiniteNumber(
      scenario.configuredDurationMs,
      `${label}.scenarios.${scenarioName}.configuredDurationMs`,
      1,
    );
    assertFiniteNumber(
      scenario.measuredDurationMs,
      `${label}.scenarios.${scenarioName}.measuredDurationMs`,
      1,
    );
    assertInteger(
      scenario.repetitions,
      `${label}.scenarios.${scenarioName}.repetitions`,
      1,
    );
    if (scenario.repetitions !== report.benchmark.repetitions) {
      throw new Error(
        `${label}.scenarios.${scenarioName}.repetitions must match benchmark.repetitions`,
      );
    }
    if (!Array.isArray(scenario.gpuTimings)) {
      throw new Error(
        `${label}.scenarios.${scenarioName}.gpuTimings must be an array`,
      );
    }
    if (scenario.gpuTimings.length !== scenario.repetitions) {
      throw new Error(
        `${label}.scenarios.${scenarioName}.gpuTimings must match repetitions`,
      );
    }
    if (!Array.isArray(scenario.runs)) {
      throw new Error(
        `${label}.scenarios.${scenarioName}.runs must be an array`,
      );
    }
    if (scenario.runs.length !== scenario.repetitions) {
      throw new Error(
        `${label}.scenarios.${scenarioName}.runs must match repetitions`,
      );
    }
    for (const metricPath of METRIC_PATHS) {
      assertFiniteNumber(
        readPath(scenario, metricPath),
        `${label}.scenarios.${scenarioName}.${metricPath}`,
      );
    }
  }
  validateGpuTimingCoverage(report, label);

  if (requireCurrentProfile) {
    const expectedProfile = getPerformanceProfile(report.profile.name);
    const profileOwnedValues = {
      description: report.profile.description,
      deviceScaleFactor: report.benchmark.deviceScaleFactor,
      frameBudgetMs: report.benchmark.frameBudgetMs,
      headless: report.benchmark.headless,
      randomSeed: report.benchmark.randomSeed,
      regressionThresholds: report.benchmark.regressionThresholds,
      repetitions: report.benchmark.repetitions,
      traceRepetitions: report.benchmark.traceRepetitions,
      viewport: report.benchmark.viewport,
      version: report.profile.version,
      cpuThrottleRate: report.benchmark.cpuThrottleRate,
    };
    const expectedValues = {
      description: expectedProfile.description,
      deviceScaleFactor: expectedProfile.deviceScaleFactor,
      frameBudgetMs: expectedProfile.frameBudgetMs,
      headless: expectedProfile.headless,
      randomSeed: expectedProfile.randomSeed,
      regressionThresholds: expectedProfile.regressionThresholds,
      repetitions: expectedProfile.repetitions,
      traceRepetitions: expectedProfile.traceRepetitions,
      viewport: expectedProfile.viewport,
      version: expectedProfile.version,
      cpuThrottleRate: expectedProfile.cpuThrottleRate,
    };
    if (canonicalJson(profileOwnedValues) !== canonicalJson(expectedValues)) {
      throw new Error(`${label} does not match its named profile contract`);
    }
    if (
      report.scenarios.idle.configuredDurationMs !==
        expectedProfile.idleDurationMs ||
      report.scenarios.burst.configuredDurationMs !==
        report.benchmark.workload.burstDurationMs
    ) {
      throw new Error(`${label} scenario durations do not match the profile`);
    }
  }
  return report;
};

const findIncompatibilities = (baseline, candidate) => {
  const incompatibilities = COMPATIBILITY_PATHS.filter(
    (pathValue) =>
      canonicalJson(readPath(baseline, pathValue)) !==
      canonicalJson(readPath(candidate, pathValue)),
  );
  const baselineScenarios = Object.keys(baseline.scenarios).sort();
  const candidateScenarios = Object.keys(candidate.scenarios).sort();
  if (canonicalJson(baselineScenarios) !== canonicalJson(candidateScenarios)) {
    incompatibilities.push("scenarios");
  }
  const commonScenarios = baselineScenarios.filter((scenario) =>
    Object.hasOwn(candidate.scenarios, scenario),
  );
  for (const scenario of commonScenarios) {
    for (const field of ["configuredDurationMs", "repetitions"]) {
      const pathValue = `scenarios.${scenario}.${field}`;
      if (
        canonicalJson(readPath(baseline, pathValue)) !==
        canonicalJson(readPath(candidate, pathValue))
      ) {
        incompatibilities.push(pathValue);
      }
    }
  }
  return incompatibilities;
};

const compareMetric = (baseline, candidate, scenario, metricPath) => {
  const baselineValue = readPath(baseline.scenarios[scenario], metricPath);
  const candidateValue = readPath(candidate.scenarios[scenario], metricPath);
  const threshold = candidate.benchmark.regressionThresholds[metricPath];
  const relativeAllowance =
    baselineValue * (threshold.maxRegressionPercent / 100);
  const allowedIncrease = Math.max(
    threshold.maxAbsoluteIncrease,
    relativeAllowance,
  );
  const allowedValue = baselineValue + allowedIncrease;
  return {
    allowedIncrease,
    allowedValue,
    baseline: baselineValue,
    candidate: candidateValue,
    maxAbsoluteIncrease: threshold.maxAbsoluteIncrease,
    maxRegressionPercent: threshold.maxRegressionPercent,
    percentChange:
      baselineValue === 0
        ? null
        : ((candidateValue - baselineValue) / baselineValue) * 100,
    regression: candidateValue > allowedValue,
  };
};

export const comparePerformanceReports = (
  baseline,
  candidate,
  { allowIncompatible = false } = {},
) => {
  validatePerformanceReport(baseline, "Baseline");
  validatePerformanceReport(candidate, "Candidate");
  const incompatibilities = findIncompatibilities(baseline, candidate);
  if (incompatibilities.length > 0 && !allowIncompatible) {
    throw new Error(
      [
        "Performance reports were recorded under incompatible conditions:",
        ...incompatibilities.map((pathValue) => `- ${pathValue}`),
        "Re-record both variants under the same profile and environment.",
      ].join("\n"),
    );
  }

  const commonScenarios = Object.keys(baseline.scenarios)
    .filter((scenario) => Object.hasOwn(candidate.scenarios, scenario))
    .sort();
  const scenarios = Object.fromEntries(
    commonScenarios.map((scenario) => [
      scenario,
      Object.fromEntries(
        METRIC_PATHS.map((metricPath) => [
          metricPath,
          compareMetric(baseline, candidate, scenario, metricPath),
        ]),
      ),
    ]),
  );
  const regressions = Object.entries(scenarios).flatMap(([scenario, metrics]) =>
    Object.entries(metrics)
      .filter(([, result]) => result.regression)
      .map(([metric]) => `${scenario}.${metric}`),
  );

  return {
    baseline: {
      id: baseline.id,
      renderers: baseline.renderers,
      source: baseline.source,
    },
    candidate: {
      id: candidate.id,
      renderers: candidate.renderers,
      source: candidate.source,
    },
    compatible: incompatibilities.length === 0,
    incompatibilities,
    passed: incompatibilities.length === 0 && regressions.length === 0,
    profile: candidate.profile,
    regressions,
    scenarios,
  };
};

export const comparePerformanceReportFiles = (
  baselinePath,
  candidatePath,
  options,
) =>
  comparePerformanceReports(
    readReport(baselinePath),
    readReport(candidatePath),
    options,
  );

const createEmptyIndex = () => ({
  comparisons: [],
  reports: [],
  schemaVersion: 1,
  selectedBaselines: {},
  selectionHistory: [],
});

const readIndex = (indexPath) => {
  try {
    const index = JSON.parse(readFileSync(indexPath, "utf8"));
    if (index.schemaVersion !== 1) {
      throw new Error("Unsupported performance baseline index schema");
    }
    return index;
  } catch (error) {
    if (error?.code === "ENOENT") return createEmptyIndex();
    throw error;
  }
};

const writeJsonAtomically = (outputPath, value) => {
  const temporaryPath = `${outputPath}.tmp-${process.pid}-${Date.now()}`;
  try {
    writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
      flag: "wx",
    });
    renameSync(temporaryPath, outputPath);
  } catch (error) {
    try {
      unlinkSync(temporaryPath);
    } catch (cleanupError) {
      if (cleanupError?.code !== "ENOENT") throw cleanupError;
    }
    throw error;
  }
};

const writeImmutableJson = (outputPath, value) => {
  const contents = `${JSON.stringify(value, null, 2)}\n`;
  try {
    writeFileSync(outputPath, contents, { flag: "wx" });
    return true;
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    const existing = JSON.parse(readFileSync(outputPath, "utf8"));
    if (canonicalJson(existing) !== canonicalJson(value)) {
      throw new Error(
        `Immutable performance artifact conflicts: ${outputPath}`,
      );
    }
    return false;
  }
};

const withStoreLock = (storeDirectory, callback) => {
  mkdirSync(storeDirectory, { recursive: true });
  const lockPath = path.join(storeDirectory, ".index.lock");
  let lockDescriptor;
  try {
    lockDescriptor = openSync(lockPath, "wx");
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw new Error(
        `Performance store is locked at ${lockPath}; verify no accept/select command is running before removing a stale lock`,
      );
    }
    throw error;
  }
  try {
    writeFileSync(
      lockDescriptor,
      `${JSON.stringify({ createdAt: new Date().toISOString(), pid: process.pid })}\n`,
    );
  } catch (error) {
    closeSync(lockDescriptor);
    unlinkSync(lockPath);
    throw error;
  }

  try {
    return callback();
  } finally {
    closeSync(lockDescriptor);
    unlinkSync(lockPath);
  }
};

const createSelectionKey = (report) =>
  `${report.profile.name}::${report.environment.fingerprint}`;

const createReportIndexEntry = (report, role, reportPath) => ({
  environmentFingerprint: report.environment.fingerprint,
  generatedAt: report.generatedAt,
  id: report.id,
  path: reportPath,
  profile: report.profile.name,
  renderers: report.renderers,
  revision: report.source.revision,
  role,
  variant: report.variant,
});

export const acceptPerformanceReport = ({
  allowRegression = false,
  now = new Date().toISOString(),
  replaceBaseline = false,
  reportPath,
  repositoryRoot = process.cwd(),
  role,
}) => {
  if (!["baseline", "candidate"].includes(role)) {
    throw new Error('Report role must be either "baseline" or "candidate"');
  }
  const report = validatePerformanceReport(readReport(reportPath), "Report", {
    requireCurrentProfile: true,
  });
  if (report.source.dirty !== false) {
    throw new Error("Dirty-tree reports cannot be accepted");
  }

  const storeDirectory = path.join(repositoryRoot, "performance-baselines");
  const reportsDirectory = path.join(storeDirectory, "reports");
  const comparisonsDirectory = path.join(storeDirectory, "comparisons");
  mkdirSync(reportsDirectory, { recursive: true });
  mkdirSync(comparisonsDirectory, { recursive: true });

  return withStoreLock(storeDirectory, () => {
    const indexPath = path.join(storeDirectory, "index.json");
    const index = readIndex(indexPath);
    if (index.reports.some(({ id }) => id === report.id)) {
      throw new Error(`Performance report ${report.id} is already accepted`);
    }

    const selectionKey = createSelectionKey(report);
    const trackedReportRelativePath = `reports/${report.id}.json`;
    const trackedReportPath = path.join(
      storeDirectory,
      trackedReportRelativePath,
    );
    let comparison;
    let comparisonRelativePath;

    if (role === "baseline") {
      const selectedBaseline = index.selectedBaselines[selectionKey];
      if (selectedBaseline && !replaceBaseline) {
        throw new Error(
          `Profile/environment ${selectionKey} already selects baseline ${selectedBaseline}; pass --replace-baseline to preserve it in history and select the new report`,
        );
      }
    } else {
      const selectedBaselineId = index.selectedBaselines[selectionKey];
      if (!selectedBaselineId) {
        throw new Error(
          `Profile/environment ${selectionKey} does not have a selected baseline`,
        );
      }
      const baselineEntry = index.reports.find(
        ({ id }) => id === selectedBaselineId,
      );
      if (!baselineEntry) {
        throw new Error(
          `Selected baseline ${selectedBaselineId} is missing from the index`,
        );
      }
      const baselinePath = path.join(storeDirectory, baselineEntry.path);
      comparison = comparePerformanceReportFiles(baselinePath, reportPath);
      if (!comparison.passed && !allowRegression) {
        throw new Error(
          `Candidate exceeds regression thresholds: ${comparison.regressions.join(
            ", ",
          )}`,
        );
      }
      comparisonRelativePath = `comparisons/${selectedBaselineId}--${report.id}.json`;
    }

    const createdPaths = [];
    try {
      if (writeImmutableJson(trackedReportPath, report)) {
        createdPaths.push(trackedReportPath);
      }
      index.reports.push(
        createReportIndexEntry(report, role, trackedReportRelativePath),
      );

      if (role === "baseline") {
        index.selectedBaselines[selectionKey] = report.id;
        index.selectionHistory.push({
          environmentFingerprint: report.environment.fingerprint,
          profile: report.profile.name,
          reportId: report.id,
          selectedAt: now,
          selectionKey,
        });
      } else {
        const comparisonPath = path.join(
          storeDirectory,
          comparisonRelativePath,
        );
        if (writeImmutableJson(comparisonPath, comparison)) {
          createdPaths.push(comparisonPath);
        }
        index.comparisons.push({
          baselineId: comparison.baseline.id,
          candidateId: comparison.candidate.id,
          passed: comparison.passed,
          path: comparisonRelativePath,
          recordedAt: now,
        });
      }
      writeJsonAtomically(indexPath, index);
    } catch (error) {
      for (const createdPath of createdPaths.reverse()) {
        try {
          unlinkSync(createdPath);
        } catch (cleanupError) {
          if (cleanupError?.code !== "ENOENT") throw cleanupError;
        }
      }
      throw error;
    }

    return {
      comparison,
      indexPath,
      reportPath: trackedReportPath,
    };
  });
};

export const selectPerformanceBaseline = ({
  now = new Date().toISOString(),
  profile,
  reportId,
  repositoryRoot = process.cwd(),
}) => {
  const storeDirectory = path.join(repositoryRoot, "performance-baselines");
  return withStoreLock(storeDirectory, () => {
    const indexPath = path.join(storeDirectory, "index.json");
    const index = readIndex(indexPath);
    const report = index.reports.find(({ id }) => id === reportId);
    if (!report || report.role !== "baseline" || report.profile !== profile) {
      throw new Error(
        `${reportId} is not an accepted baseline for profile ${profile}`,
      );
    }
    const selectionKey = `${profile}::${report.environmentFingerprint}`;
    index.selectedBaselines[selectionKey] = reportId;
    index.selectionHistory.push({
      environmentFingerprint: report.environmentFingerprint,
      profile,
      reportId,
      selectedAt: now,
      selectionKey,
    });
    writeJsonAtomically(indexPath, index);
    return index;
  });
};
