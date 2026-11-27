import { TabulatorFull as Tabulator } from "tabulator-tables";
import { parseClipboard, applyPaste } from "gridclip";
import { compareClipboardFormats } from "../../src/compare.ts";
import { previewInventoryPaste } from "./index.ts";

export function previewEvent(event, mapping) {
  const data = event.clipboardData;
  if (!data) return previewInventoryPaste(compareClipboardFormats({}), mapping);
  const formats = Object.fromEntries(
    Array.from(data.types, (type) => [type, data.getData(type)]),
  );
  return previewInventoryPaste(compareClipboardFormats(formats), mapping);
}

// Append importer. Tabulator's parser hook only receives text, so capture the
// full event first. Its regular paste action inserts only approved records.
export async function tabulatorImporter(element, mapping, guarded) {
  let preview;
  let pendingEvent;
  const table = new Tabulator(element, {
    clipboard: "paste",
    clipboardPasteParser: guarded
      ? () => {
          const event = pendingEvent;
          pendingEvent = undefined;
          if (
            !event ||
            event.eventPhase === Event.NONE ||
            preview?.status !== "preview"
          )
            return false;
          const ready = preview.rows.flatMap((row) =>
            row.status === "ready" ? [{ ...row.values }] : [],
          );
          return ready.length ? ready : false;
        }
      : "table",
    clipboardPasteAction: "insert",
    columns: [
      { title: "Product ID", field: "productId" },
      { title: "Quantity", field: "quantity" },
    ],
  });
  if (guarded)
    element.addEventListener(
      "paste",
      (event) => {
        pendingEvent = undefined;
        preview = previewEvent(event, mapping);
        if (
          preview.status === "blocked" ||
          preview.rows.every((r) => r.status === "review")
        ) {
          event.preventDefault();
          event.stopImmediatePropagation();
        } else pendingEvent = event;
      },
      true,
    );
  await new Promise((resolve) => table.on("tableBuilt", resolve));
  return () => ({ preview, records: table.getData() });
}

// Update importer. B/C are ID/quantity. Start at row 2, leave held rows and
// unmapped destination cells intact, and preserve the source's data-row offset.
export function gridclipImporter(element, mapping, guarded, initial) {
  let grid = initial;
  let preview;
  element.addEventListener("paste", (event) => {
    event.preventDefault();
    if (!guarded) {
      grid = applyPaste(grid, parseClipboard(event).rows, {
        row: 1,
        col: 1,
      }).grid;
      return;
    }
    preview = previewEvent(event, mapping);
    if (preview.status === "blocked") return;
    for (const row of preview.rows) {
      if (row.status === "review") continue;
      const { productId, quantity } = row.values;
      const values = [productId, quantity].filter(
        (value) => value !== undefined,
      );
      grid = applyPaste(grid, [values], {
        row: 1 + row.sourceRow - (mapping.headerRows ?? 0),
        col: productId === undefined ? 2 : 1,
      }).grid;
    }
  });
  return () => ({ preview, grid });
}
