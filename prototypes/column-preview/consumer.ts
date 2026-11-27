// Copied alongside the emitted declarations by check-types.mjs.
import {
  previewInventoryPaste,
  type PastePreview,
  type ColumnMap,
} from "./prototypes/column-preview/index.js";
import { compareClipboardFormats } from "./src/compare.js";
const c = compareClipboardFormats({ "text/plain": "00123" });
const both = previewInventoryPaste(c, {
  columns: { productId: 0, quantity: 1 },
  headerRows: 0,
});
if (both.status === "preview")
  for (const row of both.rows) {
    if (row.status === "ready") {
      row.values.quantity.toFixed();
      row.values.productId.toUpperCase();
      row.evidence.quantity.stored;
    } else {
      row.issues[0]?.sourceColumn;
      // @ts-expect-error A held row has no writable values.
      row.values;
    }
  }
if (both.status === "blocked" && both.reason === "invalid-display") {
  both.problems[0]?.format;
  // @ts-expect-error A blocked batch has no preview rows.
  both.rows;
}
const single = previewInventoryPaste(c, {
  columns: { productId: 0 },
  headerRows: 0,
});
if (single.status === "preview")
  for (const row of single.rows)
    if (row.status === "ready") {
      row.values.productId.toUpperCase();
      // @ts-expect-error No quantity was mapped.
      row.values.quantity;
    }
function withDynamicMap(columns: ColumnMap): PastePreview {
  return previewInventoryPaste(c, { columns, headerRows: 0 });
}
void withDynamicMap;
// @ts-expect-error Callers must choose whether the first row is a header.
previewInventoryPaste(c, { columns: { productId: 0 } });
