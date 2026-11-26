import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";

test("inspect the same merged header as HTML and as plain text", async ({
  page,
}) => {
  await page.goto("./");
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
  await page.goto("./");
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
  const f = JSON.parse(await readFile((await saved.path())!, "utf8"));
  expect(f.formats["text/plain"]).toBe(raw);
  expect(f.expected).toEqual(oracle);
  expect(f.source.app).toBe("Test sheet");
});

test("mobile can select a fixture and inspect a multiline cell", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("./");
  await page
    .getByRole("button", { name: "Multiline cell Google Sheets" })
    .click();
  await page.getByRole("button", { name: /B2 Call first/ }).click();
  await expect(page.locator("#points")).toContainText("U+000A");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(375);
});

test("mixed successful and failed formats can be saved in one fixture", async ({
  page,
}) => {
  await page.goto("./");
  await page.locator("#paste").evaluate((target) => {
    const data = new DataTransfer();
    data.setData("text/plain", "a".repeat(255) + "🧪");
    data.setData("text/html", "<p>Text only</p>");
    target.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await expect(page.locator("#points")).toContainText("U+1F9EA");
  await page.getByRole("button", { name: "Save fixture" }).click();
  await page.getByRole("button", { name: "Use current parser output" }).click();
  const expected = JSON.parse(
    await page.getByLabel("Expected grids (JSON)").inputValue(),
  );
  expect(expected["text/html"]).toEqual({ error: "no-table" });
  expect(expected["text/plain"].rows[0][0]).toMatch(/🧪$/u);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download JSON" }).click();
  expect((await download).suggestedFilename()).toBe("my-paste.json");
});

test("native paste survives browsing the library and grid cells have one tab stop", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("./");
  await expect(page.locator("#match")).toHaveText("Matches expectation");
  const first = page.getByRole("button", { name: "A1 Text ID" });
  await first.focus();
  await first.press("ArrowRight");
  await expect(page.locator("#address")).toHaveText("B1");
  await expect(page.locator("#grid button[tabindex='0']")).toHaveCount(1);
  await page.evaluate(() => navigator.clipboard.writeText("fresh\tclipboard"));
  await page.locator("#paste").press("ControlOrMeta+v");
  await expect(page.locator("#title")).toHaveText("My paste");
  await page
    .getByRole("button", { name: "Multiline cell Google Sheets" })
    .click();
  await page.getByRole("button", { name: "My latest paste" }).click();
  await expect(
    page.getByRole("button", { name: "B1 clipboard" }),
  ).toBeVisible();
});
