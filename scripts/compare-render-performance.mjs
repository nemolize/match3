import process from "node:process";

import { comparePerformanceReportFiles } from "./performance-report.mjs";

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
  const comparison = comparePerformanceReportFiles(
    baselinePath,
    candidatePath,
    { allowIncompatible },
  );

  console.log(JSON.stringify(comparison, null, 2));
  if (comparison.regressions.length > 0) process.exitCode = 2;
}
