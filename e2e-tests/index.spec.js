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
  3, 42, 37.1, 42.6, 77.5, 30.5, 14.8, 54.2, -10.4, 40.5, 31.6, 36.6, 73.5,
  20.3, 12.9, 46.4, -7.9, 33.7, 26.5, 28.8, 62, 15.7, 7.3, 38.5,
];

const expectedFacetSignature = [
  1.39, 0.9, 1.24, 1.17, 0.99, 1.35, 0.98, 1.22, -0.91, 0.49, -0.03, 0.11, 0.38,
  -0.3, 0.39, 0.01, -0.48, -1.39, -1.21, -1.27, -1.37, -1.05, -1.37, -1.23,
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

test("launches simulated wave ripples from cleared cells", async ({ page }) => {
  const measureBackgroundChange = async (
    triggerName,
    captureTimings = false,
  ) => {
    await page.goto("/e2e-tests/fixtures/ripple.html");
    const canvas = await expectWebGpuReady(page);
    await page.waitForTimeout(250);
    if (captureTimings) {
      await page.evaluate(async () => {
        await window.__match3RendererPerformance?.resetGpuTimings();
      });
    }
    await page.getByRole("button", { name: triggerName }).click();
    await expect(page.getByRole("grid").getByRole("button")).toHaveCount(0);
    await page.waitForTimeout(2_600);
    const before = await captureCanvasFrame(canvas);
    await page.waitForTimeout(500);
    const after = await captureCanvasFrame(canvas);
    const difference = await page.evaluate(
      async ({ afterCapture, beforeCapture }) => {
        const decode = async (base64) => {
          const image = new Image();
          image.src = `data:image/png;base64,${base64}`;
          await image.decode();
          const surface = document.createElement("canvas");
          surface.width = image.naturalWidth;
          surface.height = image.naturalHeight;
          const context = surface.getContext("2d");
          if (!context)
            throw new Error("A 2D sampling context is unavailable.");
          context.drawImage(image, 0, 0);
          return context.getImageData(0, 0, surface.width, surface.height);
        };
        const beforeImage = await decode(beforeCapture);
        const afterImage = await decode(afterCapture);
        let centerDelta = 0;
        let centerPixels = 0;
        let edgeDelta = 0;
        let edgePixels = 0;
        for (let y = 0; y < beforeImage.height; y += 1) {
          for (let x = 0; x < beforeImage.width; x += 1) {
            const offset = (y * beforeImage.width + x) * 4;
            const delta =
              Math.abs(
                (beforeImage.data[offset] ?? 0) -
                  (afterImage.data[offset] ?? 0),
              ) +
              Math.abs(
                (beforeImage.data[offset + 1] ?? 0) -
                  (afterImage.data[offset + 1] ?? 0),
              ) +
              Math.abs(
                (beforeImage.data[offset + 2] ?? 0) -
                  (afterImage.data[offset + 2] ?? 0),
              );
            const normalizedX = x / beforeImage.width;
            const normalizedY = y / beforeImage.height;
            if (
              normalizedX >= 0.18 &&
              normalizedX <= 0.82 &&
              normalizedY >= 0.18 &&
              normalizedY <= 0.78
            ) {
              centerDelta += delta;
              centerPixels += 1;
            } else if (
              normalizedX <= 0.1 ||
              normalizedX >= 0.9 ||
              normalizedY <= 0.1 ||
              normalizedY >= 0.9
            ) {
              edgeDelta += delta;
              edgePixels += 1;
            }
          }
        }
        return {
          centerMeanDelta: centerDelta / centerPixels,
          edgeMeanDelta: edgeDelta / edgePixels,
        };
      },
      { afterCapture: after, beforeCapture: before },
    );
    const timings = captureTimings
      ? await page.evaluate(async () =>
          window.__match3RendererPerformance?.readGpuTimings(),
        )
      : undefined;
    return { difference, timings };
  };

  const ambient = await measureBackgroundChange("Clear without ripple");
  const ripple = await measureBackgroundChange("Trigger clear ripple", true);
  expect(ripple.difference.centerMeanDelta).toBeGreaterThan(
    ambient.difference.centerMeanDelta * 1.1,
  );
  expect(ripple.difference.edgeMeanDelta).toBeGreaterThan(
    ambient.difference.edgeMeanDelta * 1.5,
  );
  expect(ripple.timings?.supported).toBe(true);
  expect(ripple.timings?.passes?.waveSimulation?.sampleCount).toBe(1);
});

test("does not inject clear ripples for reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/e2e-tests/fixtures/ripple.html");
  const canvas = await expectWebGpuReady(page);
  const before = await captureCanvasFrame(canvas);
  await page.getByRole("button", { name: "Trigger clear ripple" }).click();
  await expect(page.getByRole("grid").getByRole("button")).toHaveCount(0);
  const after = await captureCanvasFrame(canvas);

  const outsideChangedPixels = await page.evaluate(
    async ({ afterCapture, beforeCapture }) => {
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
      const beforeImage = await decode(beforeCapture);
      const afterImage = await decode(afterCapture);
      let changed = 0;
      for (let y = 0; y < beforeImage.height; y += 1) {
        for (let x = 0; x < beforeImage.width; x += 1) {
          const normalizedX = x / beforeImage.width;
          const normalizedY = y / beforeImage.height;
          if (
            normalizedX >= 0.18 &&
            normalizedX <= 0.82 &&
            normalizedY >= 0.34 &&
            normalizedY <= 0.58
          ) {
            continue;
          }
          const offset = (y * beforeImage.width + x) * 4;
          const delta =
            Math.abs(
              (beforeImage.data[offset] ?? 0) - (afterImage.data[offset] ?? 0),
            ) +
            Math.abs(
              (beforeImage.data[offset + 1] ?? 0) -
                (afterImage.data[offset + 1] ?? 0),
            ) +
            Math.abs(
              (beforeImage.data[offset + 2] ?? 0) -
                (afterImage.data[offset + 2] ?? 0),
            );
          if (delta > 6) changed += 1;
        }
      }
      return changed;
    },
    { afterCapture: after, beforeCapture: before },
  );

  expect(outsideChangedPixels).toBeLessThan(100);
});

test("renders uniformly dark blue water with bubbles disabled", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/e2e-tests/fixtures/optics.html");
  const canvas = await expectWebGpuReady(page);
  await page.getByRole("button", { name: "Clear board" }).click();
  await expect(page.getByRole("grid").getByRole("button")).toHaveCount(0);
  const sandTextureSize = await page.evaluate(async () => {
    const image = new Image();
    image.src = "/images/beach-sand.webp";
    await image.decode();
    return [image.naturalWidth, image.naturalHeight];
  });
  expect(sandTextureSize).toEqual([2048, 2048]);
  const capture = await captureCanvasFrame(canvas);

  const profile = await page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const surface = document.createElement("canvas");
    surface.width = image.naturalWidth;
    surface.height = image.naturalHeight;
    const context = surface.getContext("2d");
    if (!context) throw new Error("A 2D sampling context is unavailable.");
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(
      0,
      0,
      surface.width,
      surface.height,
    ).data;

    const averageBand = (startY, endY) => {
      const sum = [0, 0, 0];
      let count = 0;
      for (let y = startY; y < endY; y += 1) {
        for (let x = 0; x < surface.width; x += 1) {
          const offset = (y * surface.width + x) * 4;
          sum[0] += pixels[offset] ?? 0;
          sum[1] += pixels[offset + 1] ?? 0;
          sum[2] += pixels[offset + 2] ?? 0;
          count += 1;
        }
      }
      const color = sum.map((channel) => channel / count);
      return {
        blue: color[2] ?? 0,
        green: color[1] ?? 0,
        luminance:
          (color[0] ?? 0) * 0.2126 +
          (color[1] ?? 0) * 0.7152 +
          (color[2] ?? 0) * 0.0722,
        red: color[0] ?? 0,
      };
    };
    const bandHeight = Math.floor(surface.height * 0.2);
    return {
      bottom: averageBand(surface.height - bandHeight, surface.height),
      top: averageBand(0, bandHeight),
    };
  }, capture);

  expect(profile.top.blue).toBeGreaterThan(profile.top.green * 1.3);
  expect(profile.bottom.blue).toBeGreaterThan(profile.bottom.green * 1.3);
  expect(profile.top.green).toBeGreaterThan(profile.top.red * 1.3);
  expect(profile.bottom.green).toBeGreaterThan(profile.bottom.red * 1.3);
  const meanLuminance = (profile.top.luminance + profile.bottom.luminance) / 2;
  expect(
    Math.abs(profile.top.luminance - profile.bottom.luminance) / meanLuminance,
  ).toBeLessThan(0.08);
  expect(profile.top.blue).toBeLessThan(130);
  expect(profile.bottom.blue).toBeLessThan(130);
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
