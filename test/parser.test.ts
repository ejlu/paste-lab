import assert from "node:assert/strict";
import test from "node:test";
import { parseFormat, parseText, parseHTML } from "../src/parser.ts";
import {
  capturePaste,
  checkExpected,
  coordinate,
  visibleWhitespace,
} from "../src/fixture.ts";

test("quoted cells preserve literal delimiters, CRLF and doubled quotes", () => {
  assert.deepEqual(parseText('"A\tB"\t"two\r\n""lines"""\r\n').rows, [
    ["A\tB", 'two\r\n"lines"'],
  ]);
  assert.deepEqual(parseText("a\n\n").rows, [["a"], [""]]);
  assert.deepEqual(parseText("a\t\n\tb\t").rows, [
    ["a", ""],
    ["", "b", ""],
  ]);
  assert.throws(() => parseText('"unterminated'), /Unclosed/);
});

test("rowspans reserve the column on subsequent rows", () => {
  assert.deepEqual(
    parseHTML("<table><tr><td rowspan=2>X<td>A<tr><td>B</table>"),
    {
      rows: [
        ["X", "A"],
        [null, "B"],
      ],
      merges: [{ row: 0, column: 0, width: 1, height: 2 }],
    },
  );
});

test("unsupported content and excessive spans produce useful diagnostics", () => {
  assert.throws(() => parseHTML("<p>Hi</p>"), /No table/);
  assert.throws(
    () => parseHTML("<table><tr><td colspan=20001>X</table>"),
    /limit/,
  );
  assert.throws(() => parseFormat("application/json", "{}"), /Raw view/);
});

test("raw strings round-trip unchanged and expectations must be explicit", () => {
  const raw = "x\r\n\t \u00a0";
  const f = capturePaste({
    types: ["text/plain", "Files"],
    getData: () => raw,
  });
  assert.equal(JSON.parse(JSON.stringify(f)).formats["text/plain"], raw);
  assert.deepEqual(f.types, ["text/plain", "Files"]);
  assert.throws(() => checkExpected({}, f.formats), /rows and merges/);
  assert.equal(visibleWhitespace(raw), "x␍↵\n⇥·⍽");
  assert.equal(coordinate(1, 26), "AA2");
});

test("malformed quotes give an explicit error and rowspan gaps preserve coordinates", () => {
  assert.throws(() => parseText('"a"b'), { code: "invalid-quote" });
  assert.deepEqual(
    parseHTML("<table><tr><td>A<td rowspan=2>B<tr></table>").rows,
    [
      ["A", "B"],
      ["", null],
    ],
  );
});
