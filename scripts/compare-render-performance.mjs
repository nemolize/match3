import { readFileSync } from "node:fs";
import process from "node:process";

const argumentsWithoutSeparator = process.argv
  .slice(2)
  .filter((argument) => argument !== "--");
const allowIncompatible = argumentsWithoutSeparator.includes(
  "--allow-incompatible",
);
const reportPaths = argumentsWithoutSeparator.filter(
  (argument) => argument !== "--allow-incompatible",
);
const [baselinePath, candidatePath] = reportPaths;

if (!baselinePath || !candidatePath || reportPaths.length !== 2) {
  console.error(
    "Usage: pnpm run perf:compare <baseline.json> <candidate.json> [--allow-incompatible]",
  );
  process.exitCode = 1;
} else {
  const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
  const candidate = JSON.parse(readFileSync(candidatePath, "utf8"));

  if (
    baseline.schemaVersion !== candidate.schemaVersion ||
    baseline.schemaVersion !== 1
  ) {
    throw new Error("Performance report schemas do not match");
  }

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

  const readPath = (report, path) =>
    path.split(".").reduce((value, key) => value?.[key], report);
  const compatibilityPaths = [
    "browserVersion",
    "benchmark.buildMode",
    "benchmark.cpuThrottleRate",
    "benchmark.deviceScaleFactor",
    "benchmark.frameBudgetMs",
    "benchmark.headless",
    "benchmark.layout",
    "benchmark.randomSeed",
    "benchmark.repetitions",
    "benchmark.traceRepetitions",
    "benchmark.viewport",
    "benchmark.workload",
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
  const incompatibilities = compatibilityPaths.filter(
    (path) =>
      canonicalJson(readPath(baseline, path)) !==
      canonicalJson(readPath(candidate, path)),
  );

  const baselineScenarios = Object.keys(baseline.scenarios).sort();
  const candidateScenarios = Object.keys(candidate.scenarios).sort();
  if (canonicalJson(baselineScenarios) !== canonicalJson(candidateScenarios)) {
    incompatibilities.push("scenarios");
  }
  for (const scenario of baselineScenarios) {
    for (const field of ["durationMs", "repetitions"]) {
      const path = `scenarios.${scenario}.${field}`;
      if (
        canonicalJson(readPath(baseline, path)) !==
        canonicalJson(readPath(candidate, path))
      ) {
        incompatibilities.push(path);
      }
    }
  }

  if (incompatibilities.length > 0 && !allowIncompatible) {
    throw new Error(
      [
        "Performance reports were recorded under incompatible conditions:",
        ...incompatibilities.map((path) => `- ${path}`),
        "Re-record both variants under the same conditions, or pass --allow-incompatible for exploratory output.",
      ].join("\n"),
    );
  }

  const fields = [
    ["raf", "meanFrameIntervalMs"],
    ["raf", "p95FrameIntervalMs"],
    ["raf", "p99FrameIntervalMs"],
    ["raf", "overBudgetFrameRatio"],
    ["raf", "longTaskDurationMs"],
    ["mainThread", "TaskDurationMs"],
    ["mainThread", "ScriptDurationMs"],
    ["mainThread", "LayoutDurationMs"],
    ["mainThread", "RecalcStyleDurationMs"],
  ];

  const compareMetric = (scenario, group, field) => {
    const baselineValue = baseline.scenarios[scenario]?.[group]?.[field];
    const candidateValue = candidate.scenarios[scenario]?.[group]?.[field];
    if (!Number.isFinite(baselineValue) || !Number.isFinite(candidateValue)) {
      throw new Error(`Missing numeric metric: ${scenario}.${group}.${field}`);
    }
    return {
      baseline: baselineValue,
      candidate: candidateValue,
      percentChange:
        baselineValue === 0
          ? null
          : ((candidateValue - baselineValue) / baselineValue) * 100,
    };
  };

  const comparison = {
    compatible: incompatibilities.length === 0,
    incompatibilities,
    baseline: {
      path: baselinePath,
      source: baseline.source,
      renderers: baseline.renderers,
    },
    candidate: {
      path: candidatePath,
      source: candidate.source,
      renderers: candidate.renderers,
    },
    scenarios: Object.fromEntries(
      baselineScenarios.map((scenario) => [
        scenario,
        Object.fromEntries(
          fields.map(([group, field]) => [
            `${group}.${field}`,
            compareMetric(scenario, group, field),
          ]),
        ),
      ]),
    ),
  };

  console.log(JSON.stringify(comparison, null, 2));
}
