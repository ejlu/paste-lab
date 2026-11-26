import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { checkExpected, gridFormats } from "../src/fixture.js";
import { parseFormat } from "../src/parser.js";

const folder = new URL("../fixtures/", import.meta.url);
for (const name of readdirSync(folder).filter((n) => n.endsWith(".json"))) {
  const f = JSON.parse(readFileSync(new URL(name, folder), "utf8"));
  test(name, async (t) => {
    assert.equal(f.version, 1);
    assert.equal(f.id + ".json", name);
    checkExpected(f.expected, f.formats);
    for (const type of gridFormats.filter((k) => Object.hasOwn(f.formats, k))) {
      await t.test(type, () =>
        assert.deepEqual(parseFormat(type, f.formats[type]), f.expected[type]),
      );
    }
  });
}
