import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import * as api from "paste-lab";
import { inspectQuantity } from "./consumer.js";

const files = readdirSync("fixtures").filter(name => name.endsWith(".json"));
const captures = new Map(files.map(name => {
  const capture = JSON.parse(readFileSync("fixtures/" + name, "utf8"));
  return [capture.id, capture];
}));
const compare = id => api.compareClipboardFormats(captures.get(id).formats);

test("runtime entry point exports only the comparison and MIME constant", () => {
  assert.deepEqual(Object.keys(api).sort(), ["compareClipboardFormats", "sheetsCompact"]);
});

for (const [id, { formats, expected }] of captures) {
  test(id + " reproduces the captured displays", () => {
    const result = api.compareClipboardFormats(formats);
    for (const type of ["text/plain", "text/html"]) assert.equal(result.formats[type], "available");
    if (expected["text/html"].merges.length) {
      assert.equal(result.alignment, "merged-cells");
      assert.deepEqual(result.cells, []);
      return;
    }
    assert.equal(result.alignment, "aligned");
    for (const [field, type] of [["plain", "text/plain"], ["html", "text/html"]]) {
      assert.deepEqual(result.cells.map(row => row.map(cell => cell[field])), expected[type].rows);
    }
    if (id.startsWith("excel-")) {
      assert.equal(result.formats[api.sheetsCompact], "missing");
      for (const cell of result.cells.flat()) {
        assert.equal(cell.stored, null);
        assert.equal(cell.storedBlank, undefined);
      }
    }
  });
}

test("literal and rounded sevens look identical but lead to different import decisions", () => {
  const rounded = captures.get("sheets-rounded-number").formats;
  const literal = captures.get("sheets-single-number").formats;
  for (const type of ["text/plain", "text/html"]) assert.equal(rounded[type], literal[type]);
  assert.deepEqual(compare("sheets-rounded-number").cells[0][0],
    { plain: "7", html: "7", stored: 7.4, differences: ["stored-number"] });
  assert.deepEqual(compare("sheets-single-number").cells[0][0],
    { plain: "7", html: "7", stored: 7, differences: [] });
  assert.deepEqual(inspectQuantity(literal, 0), { status: "ready", quantity: 7 });
  assert.deepEqual(inspectQuantity(rounded, 0), { status: "review" });
  const row = captures.get("sheets-rounded-quantity").formats;
  assert.equal(Number(row["text/plain"].split("\t")[1]), 7);
  assert.deepEqual(inspectQuantity(row, 1), { status: "review" });
  assert.deepEqual(inspectQuantity(captures.get("excel-single-number").formats, 0), { status: "review" });
});

test("padded IDs retain their display spelling beside the underlying type", () => {
  const [text, numeric] = compare("sheets-product-codes").cells[1];
  assert.equal(text.stored, "00123");
  assert.deepEqual(numeric, { plain: "00123", html: "00123", stored: 123, differences: ["stored-number"] });
});

test("sparse Sheets layout preserves leading, middle and consecutive blanks and zero", () => {
  const { cells } = compare("sheets-mixed-blanks");
  assert.deepEqual(cells.map(row => row.map(cell => cell.stored)), [
    [null, "Item", "Count", "Bin"], ["lot-A", "SKU-A", 11, "bin-A"],
    ["lot-B", "SKU-B", null, "bin-B"], ["lot-C", null, null, "bin-C"],
    [null, "SKU-Z", 0, "bin-Z"], ["lot-D", "SKU-D", 43, "bin-D"],
  ]);
  for (const cell of cells.flat()) assert.equal(cell.storedBlank, cell.stored === null ? true : undefined);
});

test("unsupported Sheets metadata keeps the display and withholds all stored values", () => {
  for (const id of ["sheets-formula-count", "sheets-boolean"]) {
    const result = compare(id);
    assert.equal(result.formats[api.sheetsCompact], "unsupported-layout");
    for (const cell of result.cells.flat()) {
      assert.equal(cell.stored, null);
      assert.equal(cell.storedBlank, undefined);
    }
  }
});
