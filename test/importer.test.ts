import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  compareClipboardFormats,
  importInventoryRow,
  sheetsCompact,
} from "../src/importer.ts";
import type { Fixture } from "../src/types.ts";

const fixture: Fixture = JSON.parse(
  readFileSync(
    new URL("../fixtures/sheets-product-codes.json", import.meta.url),
    "utf8",
  ),
);
const { formats } = fixture;

test("Sheets 00123 preserves displayed IDs and imports only a typed quantity", () => {
  const comparison = compareClipboardFormats(formats);
  const { cells } = comparison;
  assert.deepEqual(Object.values(comparison.formats), [
    "available",
    "available",
    "available",
  ]);
  const [a, b] = cells[1];
  assert.deepEqual(a, {
    plain: "00123",
    html: "00123",
    stored: "00123",
    differences: [],
  });
  assert.deepEqual(b, {
    plain: "00123",
    html: "00123",
    stored: 123,
    differences: ["stored-number"],
  });
  for (const column of [0, 1])
    assert.deepEqual(importInventoryRow(comparison, 1, column, 1), {
      status: "ready",
      record: { productId: "00123", quantity: 123 },
    });
  assert.equal(importInventoryRow(comparison, 1, 1, 0).status, "review");
});

test("missing, malformed, merged or misaligned metadata never supplies a number", () => {
  const compact = JSON.parse(formats[sheetsCompact]);
  for (const [raw, status] of [
    [undefined, "missing"],
    ["", "empty"],
    ["{", "malformed"],
    ["null", "unsupported-layout"],
    [
      JSON.stringify({ ...compact, "3": { ...compact["3"], "1": [2, 2, 4] } }),
      "unsupported-layout",
    ],
    [" ".repeat(1_000_001), "limit-exceeded"],
    [
      JSON.stringify({ ...compact, "2": [195, 0, -3, 195] }),
      "unsupported-layout",
    ],
    [JSON.stringify({ ...compact, "15": { "1": 4, "2": 1 } }), "unaligned"],
    [
      JSON.stringify({
        ...compact,
        "3": { ...compact["3"], "1": [2, 2, 4, 5] },
      }),
      "unsupported-layout",
    ],
    [
      JSON.stringify({ ...compact, "3": { ...compact["3"], "3": [] } }),
      "unsupported-layout",
    ],
  ] as const) {
    const copy = { ...formats };
    if (raw === undefined) delete copy[sheetsCompact];
    else copy[sheetsCompact] = raw;
    const comparison = compareClipboardFormats(copy);
    const { cells } = comparison;
    assert.equal(comparison.formats[sheetsCompact], status);
    assert.equal(cells[1][1].stored, null);
    assert.equal(importInventoryRow(comparison, 1, 0, 1).status, "review");
  }
});

test("types are aligned by position, including when identically displayed cells swap places", () => {
  const compact = JSON.parse(formats[sheetsCompact]);
  compact["3"]["1"] = [2, 2, 1, 4];
  const comparison = compareClipboardFormats({
    ...formats,
    [sheetsCompact]: JSON.stringify(compact),
  });
  const [a, b] = comparison.cells[1];
  assert.equal(a.stored, 123);
  assert.equal(b.stored, "00123");
  assert.equal(importInventoryRow(comparison, 1, 1, 0).status, "ready");
});

test("plain/HTML disagreement is reported and blocks an ambiguous ID", () => {
  const diff = compareClipboardFormats({
    ...formats,
    "text/plain": formats["text/plain"].replace("00123", "Z00123"),
  });
  const [id] = diff.cells[1];
  assert.deepEqual(id.differences, ["display-text", "stored-text"]);
  assert.equal(importInventoryRow(diff, 1, 0, 1).status, "review");
  assert.deepEqual(
    compareClipboardFormats({ ...formats, "text/plain": "a\tb\tc" }).cells,
    [],
  );
});

function withNumber(value: number, plain = String(value), html = plain) {
  const compact = JSON.parse(formats[sheetsCompact]);
  compact["3"]["3"] = [value];
  return compareClipboardFormats({
    ...formats,
    [sheetsCompact]: JSON.stringify(compact),
    "text/plain": formats["text/plain"].replace(
      /00123$/,
      () => '"' + plain.replaceAll('"', '""') + '"',
    ),
    "text/html": formats["text/html"].replace(
      "00123</td></tr></tbody>",
      () => html + "</td></tr></tbody>",
    ),
  });
}

test("quantity requires an agreed display of the exact nonnegative safe integer", () => {
  for (const value of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(
      importInventoryRow(withNumber(value), 1, 0, 1).status,
      "review",
    );
  }
  for (const display of ["00500", "123 ", "123\n", "1.23e2", "", "123.0"]) {
    assert.equal(
      importInventoryRow(withNumber(123, display), 1, 0, 1).status,
      "review",
    );
  }
  for (const [plain, html] of [
    ["999", "00123"],
    ["00123", "123"],
  ]) {
    const comparison = withNumber(123, plain, html);
    assert.ok(comparison.cells[1][1].differences.includes("display-text"));
    assert.equal(importInventoryRow(comparison, 1, 0, 1).status, "review");
  }
  for (const value of [0, Number.MAX_SAFE_INTEGER]) {
    assert.deepEqual(
      importInventoryRow(withNumber(value, "00" + value), 1, 0, 1),
      {
        status: "ready",
        record: { productId: "00123", quantity: value },
      },
    );
  }
});

test("IDs preserve padding and reject contradictory stored text and lossy numeric displays", () => {
  const compact = JSON.parse(formats[sheetsCompact]);
  compact["3"]["4"][2] = "ABC";
  const comparison = compareClipboardFormats({
    ...formats,
    [sheetsCompact]: JSON.stringify(compact),
  });
  assert.deepEqual(comparison.cells[1][0].differences, ["stored-text"]);
  assert.equal(importInventoryRow(comparison, 1, 0, 1).status, "review");
  const lossy = withNumber(123456789012, "1.23E+11");
  const result = importInventoryRow(lossy, 1, 1, 1);
  assert.equal(result.status, "review");
  assert.ok(
    result.status === "review" &&
      result.issues.some((issue) => issue.includes("Product ID")),
  );
});

test("one display and aligned Sheets metadata suffice when the other format is absent", () => {
  for (const type of ["text/plain", "text/html"] as const) {
    const copy = { ...formats };
    delete copy[type];
    const comparison = compareClipboardFormats(copy);
    assert.equal(comparison.formats[type], "missing");
    assert.deepEqual(importInventoryRow(comparison, 1, 0, 1), {
      status: "ready",
      record: { productId: "00123", quantity: 123 },
    });
  }
});

test("a failed display leaves its sibling available for inspection", () => {
  for (const [type, raw, status] of [
    ["text/plain", '"broken', "malformed"],
    ["text/plain", "", "empty"],
    ["text/html", "<table></table>", "empty"],
    ["text/html", "x".repeat(1_000_001), "limit-exceeded"],
    ["text/html", "<p>Copied range</p>", "no-table"],
  ] as const) {
    const comparison = compareClipboardFormats({ ...formats, [type]: raw });
    assert.equal(comparison.formats[type], status);
    assert.equal(comparison.alignment, "aligned");
    const qty = comparison.cells[1][1];
    assert.equal(qty.stored, 123);
    assert.equal(qty[type === "text/plain" ? "plain" : "html"], null);
    assert.equal(qty[type === "text/plain" ? "html" : "plain"], "00123");
    assert.equal(
      importInventoryRow(comparison, 1, 0, 1).status,
      status === "no-table" ? "ready" : "review",
    );
  }
});

test("missing or incompatible display grids never produce an inventory record", () => {
  for (const [input, alignment] of [
    [{ [sheetsCompact]: formats[sheetsCompact] }, "no-display"],
    [{ ...formats, "text/plain": "one cell" }, "shape-mismatch"],
    [
      {
        ...formats,
        "text/html": "<table><tr><td colspan='2'>merged</td></tr></table>",
      },
      "merged-cells",
    ],
  ] as const) {
    const comparison = compareClipboardFormats(input);
    assert.equal(comparison.alignment, alignment);
    assert.equal(comparison.formats[sheetsCompact], "unaligned");
    assert.deepEqual(comparison.cells, []);
    assert.equal(importInventoryRow(comparison, 1, 0, 1).status, "review");
  }
});

test("synthetic sparse runs leave leading and interior blanks in place across row boundaries", () => {
  const compact = JSON.parse(formats[sheetsCompact]);
  compact["15"] = { "1": 3, "2": 3 };
  compact["2"] = [194, -2, 195, -2, 194, -3, 195, 194];
  compact["3"] = {
    "1": [2, 1, 1, 2, 1],
    "4": ["SKU-A", "SKU-Z"],
    "3": [7, 9, 0],
  };
  const input = {
    "text/plain": "\tSKU-A\t7\n\t\t9\nSKU-Z\t0\t",
    [sheetsCompact]: JSON.stringify(compact),
  };
  const comparison = compareClipboardFormats(input);
  assert.deepEqual(
    comparison.cells.map((row) => row.map((cell) => cell.stored)),
    [
      [null, "SKU-A", 7],
      [null, null, 9],
      ["SKU-Z", 0, null],
    ],
  );
  assert.deepEqual(importInventoryRow(comparison, 2, 0, 1), {
    status: "ready",
    record: { productId: "SKU-Z", quantity: 0 },
  });

  const conflict = compareClipboardFormats({
    ...input,
    "text/plain": "wrong" + input["text/plain"],
  });
  assert.deepEqual(conflict.cells[0][0].differences, ["stored-blank"]);
  assert.equal(importInventoryRow(conflict, 0, 0, 2).status, "review");
  assert.deepEqual(importInventoryRow(conflict, 0, 1, 0), {
    status: "review",
    issues: ["Stored quantity is blank."],
  });
});

test("invalid runs and unconsumed typed values withhold all stored evidence", () => {
  const compact = JSON.parse(formats[sheetsCompact]);
  for (const layout of [
    [-5, 195],
    [-3, 195],
    [-3.5, 195],
    [-3, 195, -1],
    [195, 195, 195, 203],
    [-3, 195, 194],
    [-4, 195, 195],
    [-4, 195, 0],
  ]) {
    const c = compareClipboardFormats({
      ...formats,
      [sheetsCompact]: JSON.stringify({ ...compact, "2": layout }),
    });
    assert.equal(c.formats[sheetsCompact], "unsupported-layout");
    assert.ok(
      c.cells.flat().every((cell) => cell.stored === null && !cell.storedBlank),
    );
  }
});

test("a conflicting Sheets single-cell span blocks import", () => {
  const f: Fixture = JSON.parse(
    readFileSync(
      new URL("../fixtures/sheets-single-number.json", import.meta.url),
      "utf8",
    ),
  );
  const c = compareClipboardFormats({
    ...f.formats,
    "text/html": f.formats["text/html"].replace(">7<", ">8<"),
  });
  assert.equal(c.cells[0][0].html, "8");
  assert.ok(c.cells[0][0].differences.includes("display-text"));
  assert.equal(importInventoryRow(c, 0, 0, 0).status, "review");
});

test("an explicit blank and a stored empty string have distinct evidence", () => {
  const compact = JSON.parse(formats[sheetsCompact]);
  compact["2"] = [195, 194, -2, 195];
  compact["3"] = { "1": [2, 2, 1], "4": ["", "SKU-A"], "3": [7] };
  const comparison = compareClipboardFormats({
    "text/plain": "\t\nSKU-A\t7",
    [sheetsCompact]: JSON.stringify(compact),
  });
  assert.equal(comparison.formats[sheetsCompact], "available");
  const [empty, blank] = comparison.cells[0];
  assert.equal(empty.stored, "");
  assert.equal(empty.storedBlank, undefined);
  assert.equal(blank.stored, null);
  assert.equal(blank.storedBlank, true);
});

test("a trailing separator only adds a row when the other format confirms the blank", () => {
  const htmlColumn = (values: string[]) =>
    "<table>" + values.map(value => "<tr><td>" + value + "</td></tr>").join("") + "</table>";
  for (const [plain, values] of [
    ["37", ["37", ""]], ["37\n", ["37", "5"]], ["37\n", ["other", ""]],
    ["37\n", ["37", "", ""]], ["a\tb\n", ["a", ""]],
  ] as const) {
    const result = compareClipboardFormats({ "text/plain": plain, "text/html": htmlColumn([...values]) });
    assert.equal(result.alignment, "shape-mismatch");
    assert.deepEqual(result.cells, []);
  }
  for (const separator of ["\n", "\r", "\r\n"]) {
    const result = compareClipboardFormats({
      "text/plain": "37" + separator + separator, "text/html": htmlColumn(["37", "", ""]),
    });
    assert.deepEqual(result.cells.map(row => row[0].plain), ["37", "", ""]);
    assert.equal(result.cells[2][0].storedBlank, undefined);
  }
  const compact = JSON.stringify({ "1": 1, "2": [195, 195], "3": { "1": [1, 1], "3": [37, 8] }, "15": { "1": 2, "2": 1 } });
  const result = compareClipboardFormats({ "text/plain": "37\n", [sheetsCompact]: compact });
  assert.equal(result.formats[sheetsCompact], "unaligned");
  assert.equal(result.cells.length, 1);
  assert.equal(result.cells[0][0].stored, null);
});
