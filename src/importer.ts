import {
  displayProblems,
  issueMessages,
  previewRow,
} from "./column-preview.ts";
import type { ClipboardComparison } from "./compare.ts";
export { compareClipboardFormats, sheetsCompact } from "./compare.ts";
export type { CellEvidence, ClipboardComparison } from "./compare.ts";

export type InventoryImport =
  | { status: "ready"; record: { productId: string; quantity: number } }
  | { status: "review"; issues: string[] };

export function importInventoryRow(
  comparison: ClipboardComparison,
  rowIndex: number,
  idColumn: number,
  quantityColumn: number,
): InventoryImport {
  const row = comparison.cells[rowIndex];
  if (!row?.[idColumn] || !row[quantityColumn])
    return {
      status: "review",
      issues: ["Choose aligned cells for both fields."],
    };
  const issues = displayProblems(comparison).map(
    ({ format, status }) => `Review the ${format} representation (${status}).`,
  );
  const result = previewRow(row, rowIndex, {
    productId: idColumn,
    quantity: quantityColumn,
  });
  if (result.status === "review")
    issues.push(...result.issues.map((issue) => issueMessages[issue.code]));
  else if (!issues.length) return { status: "ready", record: result.values };
  return { status: "review", issues };
}
