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
  const { cells, note } = compareClipboardFormats(formats);
  assert.equal(note, "");
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
    differences: ["formatted-number"],
  });
  for (const id of [a, b])
    assert.deepEqual(importInventoryRow(id, b), {
      status: "ready",
      record: { productId: "00123", quantity: 123 },
    });
  assert.equal(importInventoryRow(b, a).status, "review");
});

test("missing, malformed, sparse or misaligned metadata never supplies a number", () => {
  const compact = JSON.parse(formats[sheetsCompact]);
  for (const raw of [
    undefined,
    "",
    "{",
    "null",
    JSON.stringify({ ...compact, "2": [195, 0, -3, 195] }),
    JSON.stringify({ ...compact, "15": { "1": 4, "2": 1 } }),
    JSON.stringify({ ...compact, "3": { ...compact["3"], "1": [2, 2, 4, 5] } }),
    JSON.stringify({ ...compact, "3": { ...compact["3"], "3": [] } }),
  ]) {
    const copy = { ...formats };
    if (raw === undefined) delete copy[sheetsCompact];
    else copy[sheetsCompact] = raw;
    const { cells, note } = compareClipboardFormats(copy);
    assert.ok(note);
    assert.equal(cells[1][1].stored, null);
    assert.equal(importInventoryRow(cells[1][0], cells[1][1]).status, "review");
  }
});

test("types are aligned by position, including when identically displayed cells swap places", () => {
  const compact = JSON.parse(formats[sheetsCompact]);
  compact["3"]["1"] = [2, 2, 1, 4];
  const [a, b] = compareClipboardFormats({
    ...formats,
    [sheetsCompact]: JSON.stringify(compact),
  }).cells[1];
  assert.equal(a.stored, 123);
  assert.equal(b.stored, "00123");
  assert.equal(importInventoryRow(b, a).status, "ready");
});

test("plain/HTML disagreement is reported and blocks an ambiguous ID", () => {
  const diff = compareClipboardFormats({
    ...formats,
    "text/plain": formats["text/plain"].replace("00123", "Z00123"),
  });
  const [id, qty] = diff.cells[1];
  assert.deepEqual(id.differences, ["display-text", "stored-text"]);
  assert.equal(importInventoryRow(id, qty).status, "review");
  assert.deepEqual(
    compareClipboardFormats({ ...formats, "text/plain": "a\tb\tc" }).cells,
    [],
  );
});

test("inventory quantities must be whole, nonnegative and safe", () => {
  const [id, qty] = compareClipboardFormats(formats).cells[1];
  for (const n of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1])
    assert.equal(
      importInventoryRow(id, { ...qty, stored: n }).status,
      "review",
    );
  assert.deepEqual(importInventoryRow(id, { ...qty, stored: 0 }), {
    status: "ready",
    record: { productId: "00123", quantity: 0 },
  });
});
