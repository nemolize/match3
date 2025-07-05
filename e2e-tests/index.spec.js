import { expect, test } from "@playwright/test";

test("should load the match3 game page", async ({ page }) => {
  await page.goto("/");

  // Check page title
  await expect(page).toHaveTitle("Web App Template");

  // Check that the match3 game content is present
  await expect(
    page.getByRole("heading", { name: "Match3 Game" }),
  ).toBeVisible();

  // Check that placeholder content is present
  await expect(page.getByText("Game coming soon...")).toBeVisible();
});
