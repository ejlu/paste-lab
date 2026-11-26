import { readFileSync } from "node:fs";
import type { Fixture } from "../../src/types.ts";
import { test, expect } from "@playwright/test";
test("import the 00123 capture with different destination mappings", async ({
  page,
}) => {
  await page.goto("./?fixture=sheets-product-codes#importer");
  const importer = page.getByRole("region", {
    name: "Inventory import preview",
  });
  const result = importer.getByLabel("Import result");
  await expect(importer.getByRole("table")).toContainText(
    "Display differs from stored number",
  );
  await expect(result).toHaveText(/"productId": "00123",\s*"quantity": 123/);
  await importer.getByLabel("Source row").fill("3");
  await expect(result).toHaveAttribute("data-state", "review");
  await expect(result).toHaveText("Choose a data row in range.");
  await importer.getByLabel("Source row").fill("2");
  await importer.getByLabel("Product ID column").selectOption("1");
  await expect(result).toHaveText(/"productId": "00123",\s*"quantity": 123/);
  await importer.getByLabel("Quantity column").selectOption("0");
  await expect(result).toContainText("Review required");
  await page
    .getByRole("button", { name: "Product codes Excel", exact: true })
    .click();
  await expect(importer).toContainText(
    "Sheets stored-value data was not supplied",
  );
  await expect(result).toContainText("Review required");
});

test("paste events preserve the valid record and flag malformed or conflicting representations", async ({
  page,
}) => {
  const { formats }: Fixture = JSON.parse(
    readFileSync(
      new URL("../../fixtures/sheets-product-codes.json", import.meta.url),
      "utf8",
    ),
  );
  await page.goto("./");
  const preview = page.getByRole("region", {
    name: "Inventory import preview",
  });
  for (const [plain, state, explanation] of [
    [formats["text/plain"], "ready", '"quantity": 123'],
    ['"unfinished', "review", "Review the text/plain representation"],
    [
      formats["text/plain"].replace(/00123$/, "999"),
      "review",
      "two displayed strings differ",
    ],
  ]) {
    await page.locator("#paste").evaluate(
      (target, payload) => {
        const clipboardData = new DataTransfer();
        for (const [type, value] of Object.entries(payload))
          clipboardData.setData(type, value);
        target.dispatchEvent(
          new ClipboardEvent("paste", {
            clipboardData,
            bubbles: true,
            cancelable: true,
          }),
        );
      },
      { ...formats, "text/plain": plain },
    );
    await expect(preview.getByRole("table")).toContainText('"00123"');
    await expect(preview.getByLabel("Import result")).toHaveAttribute(
      "data-state",
      state,
    );
    await expect(preview.getByLabel("Import result")).toContainText(
      explanation,
    );
  }
});

test("switching from repeated counts to the range with a blank exposes the review outcome", async ({
  page,
}) => {
  await page.goto("./?fixture=sheets-duplicate-counts#importer");
  const preview = page.getByRole("region", {
    name: "Inventory import preview",
  });
  const result = preview.getByLabel("Import result");
  await preview.getByLabel("Source row").fill("4");
  await expect(result).toContainText('"quantity": 0');
  await page
    .getByRole("button", { name: "One blank count Google Sheets", exact: true })
    .click();
  await expect(result).toContainText('"quantity": 7');
  await preview.getByLabel("Source row").fill("4");
  await expect(result).toContainText('"quantity": 0');
  await preview.getByLabel("Source row").fill("5");
  await expect(preview.getByRole("table")).toContainText("Blank cell");
  await expect(result).toContainText("Stored quantity is blank.");
  await expect(result).toHaveAttribute("data-state", "review");
});

test("one copied Sheets cell can supply both inventory fields", async ({
  page,
}) => {
  await page.goto("./?fixture=sheets-single-number#importer");
  await expect(page.getByLabel("Import result")).toHaveText(
    /"productId": "7",\s*"quantity": 7/,
  );
});
