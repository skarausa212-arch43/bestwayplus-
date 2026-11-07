import { test, expect } from "@playwright/test";

test("mobile: home, tab bar navigation and menu work on a phone", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("YOUR TOY.");
  const tabs = page.getByRole("navigation", { name: "Tab bar" });
  await expect(tabs).toBeVisible();
  await tabs.getByRole("link", { name: "Collection" }).click();
  await expect(page).toHaveURL(/\/collection$/);
  await expect(page.getByText("MODU RABBIT")).toBeVisible();

  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("dialog").getByRole("link", { name: "MODU School" }).click();
  await expect(page).toHaveURL(/\/school$/);

  // no horizontal scrolling on phones
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("mobile: unknown NFC token shows a friendly not-found state", async ({ page }) => {
  await page.goto("/t/AAAAAAAAAAAAAAAAAAAAAA");
  await expect(page.getByText("Page not found")).toBeVisible();
});
