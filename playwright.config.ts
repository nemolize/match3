import { defineConfig, devices } from "@playwright/test";

import { e2eSoftwareWebGpuLaunchArgs } from "./playwright.webgpu";

const playwrightPort = Number(process.env.PLAYWRIGHT_PORT ?? "5173");
if (
  !Number.isInteger(playwrightPort) ||
  playwrightPort < 1 ||
  playwrightPort > 65_535
) {
  throw new Error("PLAYWRIGHT_PORT must be an integer between 1 and 65535.");
}
const playwrightBaseUrl = `http://localhost:${playwrightPort}`;

export default defineConfig({
  testDir: "./e2e-tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",
  use: {
    baseURL: playwrightBaseUrl,
    launchOptions: {
      args: e2eSoftwareWebGpuLaunchArgs,
    },
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], channel: "chromium" },
    },
  ],
  webServer: {
    command: `pnpm exec vite --port ${playwrightPort}`,
    url: playwrightBaseUrl,
    reuseExistingServer: !process.env.CI,
  },
});
