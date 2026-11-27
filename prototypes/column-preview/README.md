# Column-aware paste preview

A local API experiment for two inventory fields. The proposed entry point is `prototypes/column-preview/index.ts`.

```ts
const comparison = compareClipboardFormats(formats);
const preview = previewInventoryPaste(comparison, {
  columns: { productId: 0, quantity: 1 },
  headerRows: 1,
});
```

Map either or both fields. Source columns and reported rows are zero-based offsets in the copied range. The top-left copied cell is A1 in these coordinates regardless of where it lived in the source sheet. Callers must set `headerRows` to 0 or 1. Invalid mapping indices throw a RangeError. A column absent from every data row blocks the batch. A missing cell in an otherwise mapped column sends that row to review.

A blocked paste has a batch reason. A preview has ordered rows. A ready row has typed values and the supporting cell evidence for exactly its mapped fields. A display-only ID has a null stored value. Both blocked and successful previews include the per-format statuses. A review row has issues with the field, source column, reason code and cell evidence. For the rounded inventory capture, the issue at B1 includes displayed strings `"7"` and stored number `7.4`. The caller decides which ready rows to commit and how to present held rows.

Product IDs retain the displayed spelling and can use display-only evidence. Quantities require a stored nonnegative safe integer and matching displayed digits; leading zero padding is accepted. The available Excel captures have no stored number. A missing display can be tolerated when another display supplies evidence; malformed, over-limit or empty display formats block the batch. The existing workbench row importer and the prototype share these rules.

## Run the importer trials

From the repo root, run `npm ci`, `npm ci --prefix prototypes/column-preview`, `npx playwright install chromium`, and `npm test --prefix prototypes/column-preview`. The script first compiles a strict NodeNext consumer against the emitted prototype declarations. The browser trial replays saved clipboard formats through DOM paste events in Chromium.

Tabulator 6.7.1 appends approved records via its clipboard parser and built-in insert action. A Gridclip 1.0.0 importer updates existing cells via applyPaste, retaining the destination row when a source row needs review. Jspreadsheet CE 4.15.0 uses its native before-paste hook to veto a whole rectangle when any row needs review, or to paste the approved fields through its own text-cell writer. Each importer chooses its own commit behavior from the same preview. Single-field pastes update only their mapped field. The trials assert the complete destination state, including neighboring cells.

## Trial results

The unguarded Tabulator and Jspreadsheet importers both wrote the displayed `7` for the Sheets row containing `7.4`. With the preview, both held that row and accepted the genuine seven. The padded product code produced `{ productId: "00123", quantity: 123 }`. In the mixed-blank capture, the preview marked three rows ready and two for review. Tabulator appended three, Gridclip updated the three corresponding destination rows, and Jspreadsheet retained the entire original selection under its all-or-nothing policy.

The tests also exercise consecutive accepted and held events and missing clipboard evidence. Jspreadsheet's document-level handler can receive a paste targeted outside its element. Its adapter consumes each event's preview once. The trials replay previously captured formats in Chromium. A fresh Sheets-to-grid keyboard paste remains the next release check.
