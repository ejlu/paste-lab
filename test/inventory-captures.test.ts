import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  compareClipboardFormats,
  importInventoryRow,
  sheetsCompact,
} from "../src/importer.ts";
import { parseText } from "../src/parser.ts";
import type { Fixture } from "../src/types.ts";

function readCapture(id: string): Fixture {
  return JSON.parse(
    readFileSync(
      new URL("../fixtures/" + id + ".json", import.meta.url),
      "utf8",
    ),
  );
}

function compareCapture(id: string) {
  const comparison = compareClipboardFormats(readCapture(id).formats);
  assert.equal(comparison.alignment, "aligned");
  return comparison;
}

const cases = [
  "duplicate-counts",
  "blank-count",
  "single-number",
  "formula-count",
  "percent",
  "date",
  "boolean",
] as const;

for (const name of cases) {
  test("Excel capture: " + name, () => {
    const comparison = compareCapture("excel-" + name);
    assert.equal(comparison.formats[sheetsCompact], "missing");
    assert.equal(comparison.formats["text/html"], "available");
    const first = name === "duplicate-counts" || name === "blank-count" ? 1 : 0;
    const column = name === "single-number" ? 0 : 1;
    for (let r = first; r < comparison.cells.length; r++) {
      const cell = comparison.cells[r][column];
      assert.equal(cell.plain, cell.html);
      assert.equal(cell.stored, null);
      const result = importInventoryRow(comparison, r, 0, column);
      assert.ok(
        result.status === "review" &&
          result.issues.some((issue) => issue.includes("stored number")),
      );
    }
  });
}

test("Sheets preserves both duplicate rows and a zero quantity", () => {
  const comparison = compareCapture("sheets-duplicate-counts");
  assert.equal(comparison.formats[sheetsCompact], "available");
  const records = [1, 2, 3].map((r) => importInventoryRow(comparison, r, 0, 1));
  assert.deepEqual(records, [
    { status: "ready", record: { productId: "SKU-A", quantity: 7 } },
    { status: "ready", record: { productId: "SKU-A", quantity: 7 } },
    { status: "ready", record: { productId: "SKU-Z", quantity: 0 } },
  ]);
});

test("one blank Sheets count leaves all preceding inventory records intact", () => {
  const sparse = compareCapture("sheets-blank-count");
  const dense = compareCapture("sheets-duplicate-counts");
  assert.equal(sparse.formats[sheetsCompact], "available");
  assert.deepEqual(sparse.cells.slice(0, 4), dense.cells);
  for (const r of [1, 2, 3]) {
    assert.deepEqual(
      importInventoryRow(sparse, r, 0, 1),
      importInventoryRow(dense, r, 0, 1),
    );
  }
  assert.deepEqual(sparse.cells[4][1], {
    plain: "",
    html: "",
    stored: null,
    storedBlank: true,
    differences: [],
  });
  assert.deepEqual(importInventoryRow(sparse, 4, 0, 1), {
    status: "review",
    issues: ["Stored quantity is blank."],
  });
});

test("one Sheets number has matching plain text, HTML and typed evidence", () => {
  const comparison = compareCapture("sheets-single-number");
  assert.equal(comparison.formats[sheetsCompact], "available");
  assert.deepEqual(comparison.cells, [
    [{ plain: "7", html: "7", stored: 7, differences: [] }],
  ]);
  assert.deepEqual(importInventoryRow(comparison, 0, 0, 0), {
    status: "ready",
    record: { productId: "7", quantity: 7 },
  });
});

for (const [name, column, display] of [
  ["formula-count", 1, "7"],
  ["boolean", 1, "TRUE"],
] as const) {
  test("Sheets unsupported encoding: " + name, () => {
    const comparison = compareCapture("sheets-" + name);
    assert.equal(comparison.formats[sheetsCompact], "unsupported-layout");
    assert.equal(comparison.formats["text/html"], "available");
    const cell = comparison.cells[0][column];
    assert.equal(cell.plain, display);
    assert.equal(cell.stored, null);
    assert.equal(importInventoryRow(comparison, 0, 0, column).status, "review");
  });
}

for (const [name, display, stored, reason] of [
  ["date", "2026-01-15", 46037, "displayed digits"],
  ["percent", "25%", 0.25, "nonnegative safe integer"],
] as const) {
  test(
    "Sheets numeric storage still requires a suitable quantity: " + name,
    () => {
      const comparison = compareCapture("sheets-" + name);
      assert.equal(comparison.formats[sheetsCompact], "available");
      assert.deepEqual(comparison.cells[0][1], {
        plain: display,
        html: display,
        stored,
        differences: ["stored-number"],
      });
      const result = importInventoryRow(comparison, 0, 0, 1);
      assert.ok(
        result.status === "review" &&
          result.issues.some((issue) => issue.includes(reason)),
      );
    },
  );
}

test("real mixed blanks preserve every Sheets coordinate and only incomplete records need review", () => {
  const comparison = compareCapture("sheets-mixed-blanks");
  assert.equal(comparison.formats[sheetsCompact], "available");
  const source = [
    [null, "Item", "Count", "Bin"],
    ["lot-A", "SKU-A", 11, "bin-A"],
    ["lot-B", "SKU-B", null, "bin-B"],
    ["lot-C", null, null, "bin-C"],
    [null, "SKU-Z", 0, "bin-Z"],
    ["lot-D", "SKU-D", 43, "bin-D"],
  ];
  const expectedCells = source.map((row) =>
    row.map((stored) => ({
      plain: String(stored ?? ""),
      html: String(stored ?? ""),
      stored,
      ...(stored === null ? { storedBlank: true } : {}),
      differences: [],
    })),
  );
  assert.deepEqual(comparison.cells, expectedCells);
  assert.deepEqual(
    [1, 2, 3, 4, 5].map((r) => importInventoryRow(comparison, r, 1, 2)),
    [
      { status: "ready", record: { productId: "SKU-A", quantity: 11 } },
      { status: "review", issues: ["Stored quantity is blank."] },
      {
        status: "review",
        issues: [
          "Product ID needs a displayed value.",
          "Stored quantity is blank.",
        ],
      },
      { status: "ready", record: { productId: "SKU-Z", quantity: 0 } },
      { status: "ready", record: { productId: "SKU-D", quantity: 43 } },
    ],
  );
});

test("a rounded fraction and a literal seven have identical plain text and HTML", () => {
  const rounded = readCapture("sheets-rounded-number");
  const literal = readCapture("sheets-single-number");
  for (const type of ["text/plain", "text/html"]) {
    assert.equal(rounded.formats[type], literal.formats[type]);
  }
  assert.deepEqual(compareClipboardFormats(rounded.formats).cells, [
    [{ plain: "7", html: "7", stored: 7.4, differences: ["stored-number"] }],
  ]);
  assert.equal(compareClipboardFormats(literal.formats).cells[0][0].stored, 7);
});

test("plain-text inventory accepts seven units while stored evidence sends the fraction to review", () => {
  const { formats } = readCapture("sheets-rounded-quantity");
  const [id, count] = parseText(formats["text/plain"]).rows[0];
  const quantity = Number(count);
  const plainRecord =
    id?.trim() &&
    count !== null &&
    /^\d+$/.test(count) &&
    Number.isSafeInteger(quantity)
      ? { productId: id, quantity }
      : null;
  assert.deepEqual(plainRecord, { productId: "SKU-R", quantity: 7 });

  const evidence = compareClipboardFormats(formats);
  assert.deepEqual(evidence.cells[0][1], {
    plain: "7",
    html: "7",
    stored: 7.4,
    differences: ["stored-number"],
  });
  assert.deepEqual(importInventoryRow(evidence, 0, 0, 1), {
    status: "review",
    issues: ["Quantity must be a nonnegative safe integer."],
  });
});
