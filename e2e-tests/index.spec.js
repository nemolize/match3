import { devices, expect, test } from "@playwright/test";

const { defaultBrowserType: _defaultBrowserType, ...iPhoneSE } =
  devices["iPhone SE"];

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

test("clips refill gems while they fall in from above the board", async ({
  page,
}) => {
  await page.goto("/e2e-tests/fixtures/drop.html");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Start drop" }).click();

  await page.waitForFunction(
    () => {
      const grid = document.querySelector('[role="grid"]');
      if (!(grid instanceof HTMLElement)) return false;
      const gridBox = grid.getBoundingClientRect();
      return Array.from(
        grid.querySelectorAll('button[aria-label$=" gem"]'),
      ).some((gem) => {
        const box = gem.getBoundingClientRect();
        return box.top < gridBox.top - 0.5 && box.bottom > gridBox.top + 0.5;
      });
    },
    undefined,
    { timeout: 2500 },
  );

  const clipState = await page.getByRole("grid").evaluate((grid) => {
    const gridBox = grid.getBoundingClientRect();
    const enteringGem = Array.from(
      grid.querySelectorAll('button[aria-label$=" gem"]'),
    ).find((gem) => {
      const box = gem.getBoundingClientRect();
      return box.top < gridBox.top - 0.5 && box.bottom > gridBox.top + 0.5;
    });
    if (!(enteringGem instanceof HTMLElement)) return null;

    const gemBox = enteringGem.getBoundingClientRect();
    const sampleX = gemBox.left + gemBox.width / 2;
    const sampleY = (Math.max(gemBox.top, 0) + gridBox.top) / 2;
    const hit = document.elementFromPoint(sampleX, sampleY);
    const motionWrapper = enteringGem.parentElement;

    return {
      hitGemOutsideBoard: hit?.closest('button[aria-label$=" gem"]') !== null,
      isTransforming:
        motionWrapper instanceof HTMLElement &&
        getComputedStyle(motionWrapper).transform !== "none",
    };
  });

  expect(clipState).toEqual({
    hitGemOutsideBoard: false,
    isTransforming: true,
  });
});

test("keeps existing gems visible while they fall", async ({ page }) => {
  await page.goto("/e2e-tests/fixtures/drop.html");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Start drop" }).click();

  await page.waitForFunction(
    () =>
      Array.from(
        document.querySelectorAll(
          'button[aria-label="Paraiba tourmaline gem"]',
        ),
      ).some((gem) => {
        const motionWrapper = gem.parentElement;
        return (
          motionWrapper instanceof HTMLElement &&
          getComputedStyle(motionWrapper).transform !== "none"
        );
      }),
    undefined,
    { timeout: 2500 },
  );

  const opacities = await page
    .getByRole("button", { name: "Paraiba tourmaline gem" })
    .evaluateAll((gems) =>
      gems.map((gem) => {
        const motionWrapper = gem.parentElement;
        return motionWrapper instanceof HTMLElement
          ? Number(getComputedStyle(motionWrapper).opacity)
          : 0;
      }),
    );

  expect(opacities).toHaveLength(5);
  expect(opacities.every((opacity) => opacity === 1)).toBe(true);
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
