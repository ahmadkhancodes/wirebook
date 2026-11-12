import { expect, test } from "@playwright/test";

// The redesign's signature: one request followed along the wire, and the empty request log teaching by example.
test("hero follows one request along the wire, from your app to QuickBooks", async ({ page }) => {
  await page.goto("/");
  const wire = page.getByRole("list", { name: "Path of one request, example" });
  await expect(wire.getByRole("listitem")).toHaveCount(4);
  await expect(wire).toContainText("Your app");
  await expect(wire).toContainText("Web Connector");
  await expect(wire).toContainText("QuickBooks Desktop");
});

test("hero headline is left aligned in the display face", async ({ page }) => {
  await page.goto("/");
  const h1 = page.getByRole("heading", { level: 1 });
  const style = await h1.evaluate((el) => ({ align: getComputedStyle(el).textAlign, font: getComputedStyle(el).fontFamily }));
  expect(style.align).not.toBe("center");
  expect(style.font.toLowerCase()).toContain("bitter");
});
