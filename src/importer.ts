import type { ClipboardComparison } from "./compare.ts";
export { compareClipboardFormats, sheetsCompact } from "./compare.ts";
export type { CellEvidence, ClipboardComparison } from "./compare.ts";

export type InventoryImport =
  | { status: "ready"; record: { productId: string; quantity: number } }
  | { status: "review"; issues: string[] };

// Compare exact integer spellings. Only leading zero padding may differ.
function displaysInteger(display: string, value: number): boolean {
  return (
    Number.isSafeInteger(value) &&
    value >= 0 &&
    display.length > 0 &&
    !/[^0-9]/.test(display) &&
    display.replace(/^0+(?=[0-9])/, "") === String(value)
  );
}

export function importInventoryRow(
  comparison: ClipboardComparison,
  rowIndex: number,
  idColumn: number,
  quantityColumn: number,
): InventoryImport {
  const row = comparison.cells[rowIndex];
  const id = row?.[idColumn],
    qty = row?.[quantityColumn];
  if (!id || !qty)
    return {
      status: "review",
      issues: ["Choose aligned cells for both fields."],
    };
  const issues: string[] = [];
  for (const type of ["text/plain", "text/html"] as const) {
    const status = comparison.formats[type];
    if (
      status === "malformed" ||
      status === "limit-exceeded" ||
      status === "empty"
    )
      issues.push(`Review the ${type} representation (${status}).`);
  }
  const productId = id.plain ?? id.html;
  const quantity = qty.stored;
  if (!productId?.trim()) issues.push("Product ID needs a displayed value.");
  else if (id.differences.includes("display-text"))
    issues.push(
      "Product ID needs review because the two displayed strings differ.",
    );
  else if (
    id.storedBlank ||
    id.differences.includes("stored-text") ||
    (typeof id.stored === "number" && !displaysInteger(productId, id.stored))
  )
    issues.push("Product ID differs from the stored value.");
  if (qty.storedBlank) issues.push("Stored quantity is blank.");
  else if (typeof quantity !== "number")
    issues.push(
      "Quantity needs a stored number. Digit-only text needs review.",
    );
  else if (!Number.isSafeInteger(quantity) || quantity < 0)
    issues.push("Quantity must be a nonnegative safe integer.");
  else {
    const display = qty.plain ?? qty.html;
    if (qty.differences.includes("display-text"))
      issues.push(
        "Quantity needs review because the two displayed strings differ.",
      );
    else if (display === null || !displaysInteger(display, quantity))
      issues.push(
        "Quantity needs displayed digits that match the stored number.",
      );
  }
  if (issues.length || !productId || typeof quantity !== "number")
    return { status: "review", issues };
  return { status: "ready", record: { productId, quantity } };
}
