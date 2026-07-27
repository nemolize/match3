import process from "node:process";

import { defineConfig, devices } from "@playwright/test";

const browserChannel = process.env.PERF_BROWSER_CHANNEL;
const headless = process.env.PERF_HEADLESS !== "0";

export default defineConfig({
  testDir: "./performance-tests",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  timeout: 90_000,
  workers: 1,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://localhost:5173",
    channel: browserChannel || undefined,
    headless,
    trace: "off",
    viewport: { width: 1280, height: 900 },
  },
  webServer: {
    command: "pnpm run perf:serve",
    url: "http://localhost:5173/performance.html",
    reuseExistingServer: false,
  },
});
