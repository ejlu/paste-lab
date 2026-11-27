import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { compareClipboardFormats } from "../src/compare.ts";
import {
  previewInventoryPaste,
  type ColumnMap,
} from "../src/column-preview.ts";

const load = (id: string): Record<string, string> =>
  JSON.parse(
    readFileSync(
      new URL("../fixtures/" + id + ".json", import.meta.url),
      "utf8",
    ),
  ).formats;
const columns = { productId: 0, quantity: 1 };

test("rounded quantity carries the exact source coordinate, displays and stored number", () => {
  const result = previewInventoryPaste(
    compareClipboardFormats(load("sheets-rounded-quantity")),
    { columns, headerRows: 0 },
  );
  assert.equal(result.status, "preview");
  const row = result.rows[0];
  assert.equal(row.status, "review");
  assert.equal(row.sourceRow, 0);
  assert.deepEqual(
    row.issues.map((i) => [
      i.field,
      i.sourceColumn,
      i.code,
      i.evidence?.plain,
      i.evidence?.stored,
    ]),
    [["quantity", 1, "invalid-quantity", "7", 7.4]],
  );
  assert.ok(!("values" in row));
});

test("caller explicitly maps the same source to two destinations and chooses whether to skip a header", () => {
  const c = compareClipboardFormats(load("sheets-product-codes"));
  const mapping = { productId: 1, quantity: 1 };
  assert.deepEqual(
    previewInventoryPaste(c, { columns: mapping, headerRows: 1 }),
    {
      status: "preview",
      formats: c.formats,
      rows: [
        {
          sourceRow: 1,
          status: "ready",
          values: { productId: "00123", quantity: 123 },
          evidence: { productId: c.cells[1][1], quantity: c.cells[1][1] },
        },
      ],
    },
  );
  const all = previewInventoryPaste(c, { columns: mapping, headerRows: 0 });
  assert.equal(all.status, "preview");
  assert.deepEqual(
    all.rows.map((r) => r.status),
    ["review", "ready"],
  );
});

test("ragged rows keep their source coordinates and identify the missing mapped cell", () => {
  const result = previewInventoryPaste(
    compareClipboardFormats({ "text/plain": "A\tB\nC" }),
    { columns: { productId: 1 }, headerRows: 0 },
  );
  assert.equal(result.status, "preview");
  assert.deepEqual(result.rows[1], {
    status: "review",
    sourceRow: 1,
    issues: [
      {
        field: "productId",
        sourceColumn: 1,
        code: "missing-cell",
        evidence: null,
      },
    ],
  });
});

test("an unusable paste has a batch reason, and an unusable display never yields writes", () => {
  for (const [raw, reason] of [
    [{}, "no-display"],
    [load("sheets-merged-header"), "merged-cells"],
    [
      {
        "text/plain": "a\tb",
        "text/html": "<table><tr><td>a</td></tr></table>",
      },
      "shape-mismatch",
    ],
  ] as const) {
    assert.deepEqual(
      previewInventoryPaste(
        compareClipboardFormats(raw as Record<string, string>),
        {
          columns,
          headerRows: 0,
        },
      ),
      {
        status: "blocked",
        reason,
        formats: compareClipboardFormats(raw as Record<string, string>).formats,
      },
    );
  }
  const c = compareClipboardFormats({
    ...load("sheets-single-number"),
    "text/plain": '"broken',
  });
  assert.deepEqual(previewInventoryPaste(c, { columns, headerRows: 0 }), {
    status: "blocked",
    reason: "invalid-display",
    formats: c.formats,
    problems: [{ format: "text/plain", status: "malformed" }],
  });
  assert.deepEqual(
    previewInventoryPaste(
      compareClipboardFormats(load("sheets-single-number")),
      {
        columns,
        headerRows: 1,
      },
    ),
    {
      status: "blocked",
      reason: "no-data-rows",
      formats: compareClipboardFormats(load("sheets-single-number")).formats,
    },
  );
});

test("invalid mapping fails separately from bad clipboard input", () => {
  const c = compareClipboardFormats({});
  for (const x of [
    {},
    { quantity: -1 },
    { productId: 0.5 },
    { quantity: NaN },
  ]) {
    assert.throws(
      () =>
        previewInventoryPaste(c, { columns: x as ColumnMap, headerRows: 0 }),
      RangeError,
    );
  }
});

test("review codes distinguish blanks, disagreement, unavailable data and integer policy", () => {
  const base = compareClipboardFormats(load("sheets-rounded-number"));
  const clean = {
    plain: "7",
    html: "7",
    stored: 7,
    differences: [],
  } satisfies import("../src/compare.ts").CellEvidence;
  const cases: [
    keyof ColumnMap,
    Partial<import("../src/compare.ts").CellEvidence>,
    string,
  ][] = [
    ["productId", { plain: " ", html: " ", stored: null }, "missing-id"],
    [
      "productId",
      { plain: "", html: "7", differences: ["display-text"] },
      "id-display-conflict",
    ],
    [
      "productId",
      { stored: "8", differences: ["stored-text"] },
      "id-stored-conflict",
    ],
    [
      "quantity",
      { plain: "", html: "", stored: null, storedBlank: true },
      "blank-quantity",
    ],
    ["quantity", { stored: null }, "unknown-quantity"],
    ["quantity", { stored: "7" }, "unknown-quantity"],
    ["quantity", { stored: 7.4 }, "invalid-quantity"],
    [
      "quantity",
      { plain: "8", differences: ["display-text"] },
      "quantity-display-conflict",
    ],
    ["quantity", { plain: "8", html: "8" }, "quantity-spelling"],
  ];
  for (const [field, changes, code] of cases) {
    const result = previewInventoryPaste(
      { ...base, cells: [[{ ...clean, ...changes }]] },
      {
        columns: field === "productId" ? { productId: 0 } : { quantity: 0 },
        headerRows: 0,
      },
    );
    assert.equal(result.status, "preview");
    const row = result.rows[0];
    assert.equal(row.status, "review");
    assert.deepEqual(
      row.issues.map((i) => i.code),
      [code],
    );
  }
});

test("batch diagnostics and ready evidence distinguish missing evidence from agreement", () => {
  const malformed = compareClipboardFormats({ "text/plain": '"bad' });
  assert.equal(
    previewInventoryPaste(malformed, { columns, headerRows: 0 }).formats[
      "text/plain"
    ],
    "malformed",
  );
  const excel = compareClipboardFormats(load("excel-single-number"));
  const result = previewInventoryPaste(excel, {
    columns: { productId: 0 },
    headerRows: 0,
  });
  assert.equal(result.status, "preview");
  const row = result.rows[0];
  assert.equal(row.status, "ready");
  assert.equal(row.evidence.productId.stored, null);
  assert.equal(row.values.productId, "7");
  const missing = previewInventoryPaste(excel, {
    columns: { quantity: 10 },
    headerRows: 0,
  });
  assert.equal(missing.status, "blocked");
  assert.equal(missing.reason, "column-out-of-range");
});
