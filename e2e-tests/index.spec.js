import { devices, expect, test } from "@playwright/test";

const { defaultBrowserType: _defaultBrowserType, ...iPhoneSE } =
  devices["iPhone SE"];

const expectWebGpuReady = async (page) => {
  const canvas = page.locator('canvas[data-renderer="webgpu"]');
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute("data-renderer-status", "ready");
  await expect(page.getByRole("alert")).toHaveCount(0);
  return canvas;
};

const expectMobileLayoutToFit = async (page) => {
  const hasVerticalOverflow = await page.evaluate(
    () => document.documentElement.scrollHeight > window.innerHeight,
  );

  expect(hasVerticalOverflow).toBe(false);

  const viewportHeight = page.viewportSize()?.height;
  expect(viewportHeight).toBeDefined();

  const keyRegions = [
    page.getByText("Score").first(),
    page.getByRole("grid"),
    page.getByText("Match 3 or more gems of the same color"),
  ];

  for (const region of keyRegions) {
    const box = await region.boundingBox();
    expect(box).not.toBeNull();
    expect(box?.y).toBeGreaterThanOrEqual(0);
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(
      viewportHeight ?? 0,
    );
  }
};

test("should load the match3 game page", async ({ page }) => {
  await page.goto("/");

  // Check page title
  await expect(page).toHaveTitle("Match3 Puzzle Game");

  // Wait for the game to load
  await page.waitForLoadState("networkidle");

  // Check that the score display is present
  await expect(page.getByText("Score").first()).toBeVisible();
  await expect(page.getByText("Level")).toBeVisible();

  // Check that the new game button is present
  await expect(page.getByRole("button", { name: "New Game" })).toBeVisible();

  // Check that the game board is present (grid of gems)
  const gameBoard = page.getByRole("grid");
  await expect(gameBoard).toBeVisible();
  await expect(gameBoard).toHaveCSS("overflow", "hidden");
  await expectWebGpuReady(page);
  await expect(gameBoard).toHaveAttribute("data-gem-renderer", "webgpu");
  await expect(page.locator('[data-particle-renderer="webgpu"]')).toHaveCount(
    1,
  );

  // Check that instructions are present
  await expect(
    page.getByText("Match 3 or more gems of the same color"),
  ).toBeVisible();
  await expect(
    page.getByText("Swipe a gem toward a neighbor — or tap two adjacent gems"),
  ).toBeVisible();

  // Test that gems are swipeable
  const firstGem = page.getByRole("gridcell").first();
  await firstGem.hover();

  // Test new game functionality
  await page.getByRole("button", { name: "New Game" }).click();
  await page.waitForTimeout(500);

  // Verify the game restarted (score should be 0)
  await expect(page.locator("text=/^0$/").first()).toBeVisible();
});

test("renders deterministic refill state through WebGPU", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/e2e-tests/fixtures/drop.html");
  await page.waitForLoadState("networkidle");
  await expectWebGpuReady(page);
  await page.evaluate(async () => {
    await window.__match3RendererPerformance?.resetGpuTimings();
  });
  await page.getByRole("button", { name: "Start drop" }).click();
  await expect(
    page.getByRole("button", { name: "Paraiba tourmaline gem" }),
  ).toHaveCount(5);
  const timings = await page.evaluate(async () =>
    window.__match3RendererPerformance?.readGpuTimings(),
  );
  expect(timings?.supported).toBe(true);
  expect(timings?.passes?.gemRefraction?.sampleCount).toBe(1);
});

test("keeps semantic gems available while WebGPU animates a drop", async ({
  page,
}) => {
  await page.goto("/e2e-tests/fixtures/drop.html");
  await page.waitForLoadState("networkidle");
  await expectWebGpuReady(page);
  await page.getByRole("button", { name: "Start drop" }).click();
  await expect(
    page.getByRole("button", { name: "Paraiba tourmaline gem" }),
  ).toHaveCount(5);
  await expect(page.getByRole("grid")).toHaveAttribute(
    "data-gem-renderer",
    "webgpu",
  );
});

test("preserves pointer and keyboard activation in the semantic overlay", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expectWebGpuReady(page);

  const firstGem = page.getByRole("grid").getByRole("button").first();
  await firstGem.click();
  await expect(firstGem).toHaveAttribute("aria-pressed", "true");

  await firstGem.press("Enter");
  await expect(firstGem).toHaveAttribute("aria-pressed", "false");
});

test("resizes the WebGPU backing store after a viewport change", async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 700 });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const canvas = await expectWebGpuReady(page);

  await page.setViewportSize({ width: 420, height: 700 });
  await expect
    .poll(() =>
      canvas.evaluate((element) => {
        const canvasElement = /** @type {HTMLCanvasElement} */ (element);
        const rect = canvasElement.getBoundingClientRect();
        return (
          canvasElement.width ===
            Math.round(
              rect.width * Math.min(window.devicePixelRatio || 1, 2),
            ) &&
          canvasElement.height ===
            Math.round(rect.height * Math.min(window.devicePixelRatio || 1, 2))
        );
      }),
    )
    .toBe(true);

  const dimensions = await canvas.evaluate((element) => {
    const canvasElement = /** @type {HTMLCanvasElement} */ (element);
    const rect = canvasElement.getBoundingClientRect();
    return {
      actualHeight: canvasElement.height,
      actualWidth: canvasElement.width,
      expectedHeight: Math.round(
        rect.height * Math.min(window.devicePixelRatio || 1, 2),
      ),
      expectedWidth: Math.round(
        rect.width * Math.min(window.devicePixelRatio || 1, 2),
      ),
    };
  });
  expect(dimensions.actualWidth).toBe(dimensions.expectedWidth);
  expect(dimensions.actualHeight).toBe(dimensions.expectedHeight);
});

test("shows a diagnostic and disables input when WebGPU is unavailable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "gpu", {
      configurable: true,
      value: undefined,
    });
  });
  await page.goto("/");

  await expect(page.getByRole("alert")).toContainText(
    "WebGPU is not supported",
  );
  await expect(page.getByRole("grid")).toHaveAttribute("inert", "");
});

test("stops continuous rendering for reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expectWebGpuReady(page);
  await page.evaluate(async () => {
    await window.__match3RendererPerformance?.resetGpuTimings();
  });
  await page.waitForTimeout(150);

  const timings = await page.evaluate(async () =>
    window.__match3RendererPerformance?.readGpuTimings(),
  );
  expect(timings).toEqual({
    reason: "renderer-timing-api-unavailable",
    supported: false,
  });
});

test.describe("mobile layout", () => {
  test.use(iPhoneSE);

  test("fits a mobile viewport without vertical scrolling", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await expectMobileLayoutToFit(page);
  });

  test("fits a short mobile viewport without clipping", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 560 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await expectMobileLayoutToFit(page);
  });
});
