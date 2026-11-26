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
    "Number displayed with formatting",
  );
  await expect(result).toHaveText(/"productId": "00123",\s*"quantity": 123/);
  await importer.getByLabel("Product ID column").selectOption("1");
  await expect(result).toHaveText(/"productId": "00123",\s*"quantity": 123/);
  await importer.getByLabel("Quantity column").selectOption("0");
  await expect(result).toContainText("Review required");
  await page
    .getByRole("button", { name: "Product codes Excel", exact: true })
    .click();
  await expect(importer).toContainText("no Sheets stored-value data");
  await expect(result).toContainText("Review required");
});
