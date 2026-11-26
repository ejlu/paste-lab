import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";

test("inspect the same merged header as HTML and as plain text", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Merged header Google Sheets" })
    .click();
  await page.getByLabel("Clipboard format").selectOption("text/html");
  await expect(page.getByRole("cell", { name: "A1 Revenue" })).toHaveAttribute(
    "colspan",
    "2",
  );
  await page.getByLabel("Clipboard format").selectOption("text/plain");
  await page.getByRole("button", { name: "B1 empty", exact: true }).click();
  await expect(page.locator("#points")).toHaveText("Empty string");
});

test("paste, edit expectations, download and compare raw strings", async ({
  page,
}) => {
  await page.goto("/");
  const raw = "first\tsecond\r\nx\ty ";
  await page.locator("#paste").evaluate((target, raw) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData("text/plain", raw);
    target.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData,
        bubbles: true,
        cancelable: true,
      }),
    );
  }, raw);
  await page.getByRole("button", { name: "B2 y", exact: true }).click();
  await expect(page.locator("#points")).toHaveText("U+0079  U+0020");
  await page.getByRole("button", { name: "Save fixture" }).click();
  await page.getByLabel("Fixture name").fill("seventh-case");
  await page.getByLabel("Source app").fill("Test sheet");
  await page.getByRole("button", { name: "Download JSON" }).click();
  await expect(page.getByRole("alert")).toContainText("Supply rows and merges");
  await page.getByRole("button", { name: "Use current parser output" }).click();
  const field = page.getByLabel("Expected grids (JSON)");
  const oracle = JSON.parse(await field.inputValue());
  oracle["text/plain"].rows[1][1] = "independent expectation";
  await field.fill(JSON.stringify(oracle));
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download JSON" }).click();
  const saved = await download;
  expect(saved.suggestedFilename()).toBe("seventh-case.json");
  const f = JSON.parse(await readFile(await saved.path(), "utf8"));
  expect(f.formats["text/plain"]).toBe(raw);
  expect(f.expected).toEqual(oracle);
  expect(f.source.app).toBe("Test sheet");
});

test("mobile can select a fixture and inspect a multiline cell", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Multiline cell Google Sheets" })
    .click();
  await page.getByRole("button", { name: /B2 Call first/ }).click();
  await expect(page.locator("#points")).toContainText("U+000A");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(375);
});
