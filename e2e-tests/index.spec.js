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

const captureCanvasFrame = async (canvas) =>
  (await canvas.screenshot()).toString("base64");

const expectedMaterialSignature = [
  -80.9, -11.3, -11.9, -10.7, 28.6, -6.4, -23.6, -10.6, -117.6, 1.2, -13.1,
  -38.3, 14.9, -20.6, -33.7, -26.9, -89.6, 0.4, -12.2, -39.1, 13.3, -28.3,
  -45.3, -21.8,
];

const expectedFacetSignature = [
  0.97, -1.41, 0.98, 1.41, 1.41, 1.33, 1.2, 1.35, -1.38, 0.78, -1.37, -0.68,
  -0.59, -0.24, 0.06, -1.05, 0.41, 0.64, 0.39, -0.74, -0.82, -1.09, -1.25, -0.3,
];

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

test("renders distinguishable faceted optical gems over submerged sand", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/e2e-tests/fixtures/optics.html");
  const canvas = await expectWebGpuReady(page);
  const opticalCapture = await captureCanvasFrame(canvas);

  await page.getByRole("button", { name: "Clear board" }).click();
  await expect(page.getByRole("grid").getByRole("button")).toHaveCount(0);
  const emptyCapture = await captureCanvasFrame(canvas);

  const difference = await page.evaluate(
    async (captures) => {
      const decode = async (base64) => {
        const image = new Image();
        image.src = `data:image/png;base64,${base64}`;
        await image.decode();
        const surface = document.createElement("canvas");
        surface.width = image.naturalWidth;
        surface.height = image.naturalHeight;
        const context = surface.getContext("2d");
        if (!context) throw new Error("A 2D sampling context is unavailable.");
        context.drawImage(image, 0, 0);
        return context.getImageData(0, 0, surface.width, surface.height);
      };
      const optical = await decode(captures.optical);
      const empty = await decode(captures.empty);
      if (optical.data.length !== empty.data.length) {
        throw new Error("Comparable canvas captures are unavailable.");
      }

      let changedPixels = 0;
      let channelDelta = 0;
      let minimumX = optical.width;
      let minimumY = optical.height;
      let maximumX = 0;
      let maximumY = 0;
      for (let index = 0; index < optical.data.length; index += 4) {
        const delta =
          Math.abs((optical.data[index] ?? 0) - (empty.data[index] ?? 0)) +
          Math.abs(
            (optical.data[index + 1] ?? 0) - (empty.data[index + 1] ?? 0),
          ) +
          Math.abs(
            (optical.data[index + 2] ?? 0) - (empty.data[index + 2] ?? 0),
          );
        if (delta <= 6) continue;
        changedPixels += 1;
        channelDelta += delta / 3;
        const pixelIndex = index / 4;
        const x = pixelIndex % optical.width;
        const y = Math.floor(pixelIndex / optical.width);
        minimumX = Math.min(minimumX, x);
        minimumY = Math.min(minimumY, y);
        maximumX = Math.max(maximumX, x);
        maximumY = Math.max(maximumY, y);
      }

      const signatureColumns = 8;
      const signatureRows = 3;
      const signatureSums = Array(signatureColumns * signatureRows).fill(0);
      const signatureCounts = Array(signatureColumns * signatureRows).fill(0);
      const gemColorSums = Array.from({ length: 6 }, () => [0, 0, 0]);
      const gemColorCounts = Array(6).fill(0);
      const opticalWidth = maximumX - minimumX + 1;
      const opticalHeight = maximumY - minimumY + 1;
      for (let y = minimumY; y <= maximumY; y += 1) {
        for (let x = minimumX; x <= maximumX; x += 1) {
          const pixelOffset = (y * optical.width + x) * 4;
          const opticalLuminance =
            (optical.data[pixelOffset] ?? 0) * 0.2126 +
            (optical.data[pixelOffset + 1] ?? 0) * 0.7152 +
            (optical.data[pixelOffset + 2] ?? 0) * 0.0722;
          const emptyLuminance =
            (empty.data[pixelOffset] ?? 0) * 0.2126 +
            (empty.data[pixelOffset + 1] ?? 0) * 0.7152 +
            (empty.data[pixelOffset + 2] ?? 0) * 0.0722;
          const column = Math.min(
            signatureColumns - 1,
            Math.floor(((x - minimumX) / opticalWidth) * signatureColumns),
          );
          const row = Math.min(
            signatureRows - 1,
            Math.floor(((y - minimumY) / opticalHeight) * signatureRows),
          );
          const signatureIndex = row * signatureColumns + column;
          signatureSums[signatureIndex] += opticalLuminance - emptyLuminance;
          signatureCounts[signatureIndex] += 1;
          const colorDelta =
            Math.abs(
              (optical.data[pixelOffset] ?? 0) - (empty.data[pixelOffset] ?? 0),
            ) +
            Math.abs(
              (optical.data[pixelOffset + 1] ?? 0) -
                (empty.data[pixelOffset + 1] ?? 0),
            ) +
            Math.abs(
              (optical.data[pixelOffset + 2] ?? 0) -
                (empty.data[pixelOffset + 2] ?? 0),
            );
          if (colorDelta > 6) {
            const gemIndex = Math.min(
              gemColorSums.length - 1,
              Math.floor(((x - minimumX) / opticalWidth) * 6),
            );
            const gemColorSum = gemColorSums[gemIndex];
            if (gemColorSum) {
              gemColorSum[0] +=
                (optical.data[pixelOffset] ?? 0) -
                (empty.data[pixelOffset] ?? 0);
              gemColorSum[1] +=
                (optical.data[pixelOffset + 1] ?? 0) -
                (empty.data[pixelOffset + 1] ?? 0);
              gemColorSum[2] +=
                (optical.data[pixelOffset + 2] ?? 0) -
                (empty.data[pixelOffset + 2] ?? 0);
              gemColorCounts[gemIndex] += 1;
            }
          }
        }
      }

      const materialSignature = signatureSums.map(
        (sum, index) => Math.round((sum / signatureCounts[index]) * 10) / 10,
      );
      const facetSignature = materialSignature.map((value, index) => {
        const column = index % signatureColumns;
        const columnValues = Array.from(
          { length: signatureRows },
          (_, row) => materialSignature[row * signatureColumns + column] ?? 0,
        );
        const columnMean =
          columnValues.reduce((sum, entry) => sum + entry, 0) / signatureRows;
        const columnScale = Math.sqrt(
          columnValues.reduce(
            (sum, entry) => sum + (entry - columnMean) ** 2,
            0,
          ) / signatureRows,
        );
        return (
          Math.round(
            ((value - columnMean) / Math.max(columnScale, 0.1)) * 100,
          ) / 100
        );
      });

      return {
        changedPixels,
        facetSignature,
        gemColorDeltas: gemColorSums.map((sum, index) =>
          sum.map(
            (channel) =>
              Math.round((channel / (gemColorCounts[index] ?? 1)) * 10) / 10,
          ),
        ),
        meanChangedChannelDelta: channelDelta / changedPixels,
        materialSignature,
      };
    },
    { empty: emptyCapture, optical: opticalCapture },
  );

  expect(difference.changedPixels).toBeGreaterThan(1_000);
  expect(difference.meanChangedChannelDelta).toBeGreaterThan(60);
  expect(difference.meanChangedChannelDelta).toBeLessThan(88);
  difference.gemColorDeltas.forEach((colorDelta) => {
    expect(
      Math.hypot(colorDelta[0] ?? 0, colorDelta[1] ?? 0, colorDelta[2] ?? 0),
    ).toBeGreaterThan(42);
  });
  for (let left = 0; left < difference.gemColorDeltas.length; left += 1) {
    for (
      let right = left + 1;
      right < difference.gemColorDeltas.length;
      right += 1
    ) {
      const leftColor = difference.gemColorDeltas[left] ?? [];
      const rightColor = difference.gemColorDeltas[right] ?? [];
      const distance = Math.hypot(
        (leftColor[0] ?? 0) - (rightColor[0] ?? 0),
        (leftColor[1] ?? 0) - (rightColor[1] ?? 0),
        (leftColor[2] ?? 0) - (rightColor[2] ?? 0),
      );
      expect(distance).toBeGreaterThan(40);
    }
  }
  expect(difference.materialSignature).toHaveLength(
    expectedMaterialSignature.length,
  );
  difference.materialSignature.forEach((value, index) => {
    expect(
      Math.abs(value - (expectedMaterialSignature[index] ?? Number.NaN)),
    ).toBeLessThanOrEqual(2);
  });
  expect(difference.facetSignature).toHaveLength(expectedFacetSignature.length);
  difference.facetSignature.forEach((value, index) => {
    expect(
      Math.abs(value - (expectedFacetSignature[index] ?? Number.NaN)),
    ).toBeLessThanOrEqual(0.75);
  });
});

test("animates water-surface reflection and refraction over sand", async ({
  page,
}) => {
  await page.goto("/e2e-tests/fixtures/optics.html");
  const canvas = await expectWebGpuReady(page);
  await page.getByRole("button", { name: "Clear board" }).click();
  await expect(page.getByRole("grid").getByRole("button")).toHaveCount(0);
  const firstCapture = await captureCanvasFrame(canvas);
  await page.waitForTimeout(350);
  const secondCapture = await captureCanvasFrame(canvas);

  const changedPixels = await page.evaluate(
    async ({ first, second }) => {
      const decode = async (base64) => {
        const image = new Image();
        image.src = `data:image/png;base64,${base64}`;
        await image.decode();
        const surface = document.createElement("canvas");
        surface.width = image.naturalWidth;
        surface.height = image.naturalHeight;
        const context = surface.getContext("2d");
        if (!context) throw new Error("A 2D sampling context is unavailable.");
        context.drawImage(image, 0, 0);
        return context.getImageData(0, 0, surface.width, surface.height).data;
      };
      const firstPixels = await decode(first);
      const secondPixels = await decode(second);
      let changed = 0;
      for (let index = 0; index < firstPixels.length; index += 4) {
        const delta =
          Math.abs((firstPixels[index] ?? 0) - (secondPixels[index] ?? 0)) +
          Math.abs(
            (firstPixels[index + 1] ?? 0) - (secondPixels[index + 1] ?? 0),
          ) +
          Math.abs(
            (firstPixels[index + 2] ?? 0) - (secondPixels[index + 2] ?? 0),
          );
        if (delta > 12) changed += 1;
      }
      return changed;
    },
    { first: firstCapture, second: secondCapture },
  );

  expect(changedPixels).toBeGreaterThan(2_000);
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
