import process from "node:process";

import { acceptPerformanceReport } from "./performance-report.mjs";

const argumentsList = process.argv.slice(2).filter((value) => value !== "--");
const reportPath = argumentsList.find((value) => !value.startsWith("--"));
const readOption = (name) => {
  const optionIndex = argumentsList.indexOf(name);
  return optionIndex === -1 ? null : argumentsList[optionIndex + 1];
};
const role = readOption("--role");

if (!reportPath || !role) {
  throw new Error(
    "Usage: pnpm run perf:accept <report.json> --role baseline|candidate [--replace-baseline] [--allow-regression]",
  );
}

const result = acceptPerformanceReport({
  allowRegression: argumentsList.includes("--allow-regression"),
  replaceBaseline: argumentsList.includes("--replace-baseline"),
  reportPath,
  role,
});
console.log(`Accepted ${role}: ${result.reportPath}`);
if (result.comparison) {
  console.log(JSON.stringify(result.comparison, null, 2));
}
