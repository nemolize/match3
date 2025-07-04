import { expect, test } from "@playwright/test";

test("should load the counter demo page", async ({ page }) => {
  await page.goto("/");

  // Check page title
  await expect(page).toHaveTitle("Web App Template");

  // Check that the counter demo content is present
  await expect(
    page.getByRole("heading", { name: "Counter Demo" }),
  ).toBeVisible();

  // Check that counter functionality works
  const decrementButton = page.getByRole("button", { name: "-" });
  const incrementButton = page.getByRole("button", { name: "+" });

  await expect(decrementButton).toBeVisible();
  await expect(incrementButton).toBeVisible();

  // Test counter functionality
  await expect(page.getByText("0")).toBeVisible();
  await incrementButton.click();
  await expect(page.getByText("1")).toBeVisible();
  await decrementButton.click();
  await expect(page.getByText("0")).toBeVisible();
});
