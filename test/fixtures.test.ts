import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { assertFixture, gridFormats } from "../src/fixture.ts";
import { parseFormat } from "../src/parser.ts";

const folder = new URL("../fixtures/", import.meta.url);
for (const name of readdirSync(folder).filter((n) => n.endsWith(".json"))) {
  const f: unknown = JSON.parse(readFileSync(new URL(name, folder), "utf8"));
  test(name, async (t) => {
    assertFixture(f);
    assert.equal(f.id + ".json", name);
    const expected = f.expected;
    for (const type of gridFormats.filter((k) => Object.hasOwn(f.formats, k))) {
      await t.test(type, () => {
        const oracle = expected[type]!;
        if ("error" in oracle)
          assert.throws(() => parseFormat(type, f.formats[type]), {
            code: oracle.error,
          });
        else assert.deepEqual(parseFormat(type, f.formats[type]), oracle);
      });
    }
  });
}
