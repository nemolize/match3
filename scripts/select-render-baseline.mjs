import process from "node:process";

import { selectPerformanceBaseline } from "./performance-report.mjs";

const argumentsList = process.argv.slice(2).filter((value) => value !== "--");
const readOption = (name) => {
  const optionIndex = argumentsList.indexOf(name);
  return optionIndex === -1 ? null : argumentsList[optionIndex + 1];
};
const profile = readOption("--profile");
const reportId = readOption("--report-id");

if (!profile || !reportId) {
  throw new Error(
    "Usage: pnpm run perf:baseline:select --profile <name> --report-id <id>",
  );
}

selectPerformanceBaseline({ profile, reportId });
console.log(`Selected baseline ${reportId} for ${profile}`);
