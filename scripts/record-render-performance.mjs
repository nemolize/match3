import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import { getPerformanceProfile } from "../performance-tests/profiles.mjs";
import { acceptPerformanceReport } from "./performance-report.mjs";

const parseArguments = (argumentsList) => {
  const options = {
    acceptAs: null,
    allowDirty: false,
    allowRegression: false,
    profileName: "cpu-stress",
    replaceBaseline: false,
  };
  for (let index = 0; index < argumentsList.length; index++) {
    const argument = argumentsList[index];
    if (argument === "--") continue;
    if (argument === "--allow-dirty") {
      options.allowDirty = true;
    } else if (argument === "--allow-regression") {
      options.allowRegression = true;
    } else if (argument === "--replace-baseline") {
      options.replaceBaseline = true;
    } else if (argument === "--profile") {
      options.profileName = argumentsList[++index];
    } else if (argument === "--accept-as") {
      options.acceptAs = argumentsList[++index];
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (!options.profileName) throw new Error("--profile requires a value");
  if (
    options.acceptAs !== null &&
    !["baseline", "candidate"].includes(options.acceptAs)
  ) {
    throw new Error('--accept-as must be "baseline" or "candidate"');
  }
  return options;
};

const formatRunTimestamp = (date) =>
  date.toISOString().replaceAll("-", "").replaceAll(":", "").replace(".", "");

const run = (command, argumentsList, environment) =>
  execFileSync(command, argumentsList, {
    env: environment,
    stdio: "inherit",
  });

const options = parseArguments(process.argv.slice(2));
const profile = getPerformanceProfile(options.profileName);
const revision = execFileSync("git", ["rev-parse", "--short=12", "HEAD"], {
  encoding: "utf8",
}).trim();
const runId = `${formatRunTimestamp(new Date())}--${profile.name}--${revision}`;
const outputDirectory = path.resolve(".performance-results");
const outputPath = path.join(outputDirectory, `${runId}.json`);
mkdirSync(outputDirectory, { recursive: true });

const benchmarkEnvironment = {
  ...process.env,
  PERF_ALLOW_DIRTY: options.allowDirty ? "1" : "0",
  PERF_BROWSER_CHANNEL: profile.browserChannel ?? "",
  PERF_HEADLESS: profile.headless ? "1" : "0",
  PERF_OUTPUT_PATH: outputPath,
  PERF_PROFILE: profile.name,
  PERF_RUN_ID: runId,
};

run("pnpm", ["run", "build"], benchmarkEnvironment);
run("pnpm", ["run", "perf:build"], benchmarkEnvironment);
run(
  "pnpm",
  [
    "exec",
    "playwright",
    "test",
    "--config",
    "playwright.performance.config.ts",
  ],
  benchmarkEnvironment,
);

console.log(`Rendering performance report: ${outputPath}`);

if (options.acceptAs) {
  const accepted = acceptPerformanceReport({
    allowRegression: options.allowRegression,
    replaceBaseline: options.replaceBaseline,
    reportPath: outputPath,
    role: options.acceptAs,
  });
  console.log(`Accepted ${options.acceptAs}: ${accepted.reportPath}`);
  if (accepted.comparison) {
    console.log(
      `Regression decision: ${accepted.comparison.passed ? "passed" : "failed"}`,
    );
  }
}
