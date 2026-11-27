import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../../", import.meta.url));
const server = await createServer({
  root: fileURLToPath(new URL("./", import.meta.url)),
  configFile: false,
  logLevel: "error",
  server: { fs: { allow: [root] }, host: "127.0.0.1", port: 0 },
  optimizeDeps: {
    include: ["tabulator-tables", "gridclip", "jspreadsheet-ce"],
    entries: ["adapters.js", "jspreadsheet.js"],
  },
});
await server.listen();
let browser;
try {
  browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(server.resolvedUrls.local[0] + "trial.html");
  const sheetPage = await browser.newPage();
  async function runSpreadsheet(input, guarded) {
    await sheetPage.goto(page.url());
    return sheetPage.evaluate(
      async ({ formats, mapping, initial, guarded }) => {
        const { spreadsheetImporter } = await import("./jspreadsheet.js");
        const el = document.createElement("div");
        document.body.replaceChildren(el);
        const read = spreadsheetImporter(el, mapping, guarded, initial);
        const data = new DataTransfer();
        for (const [type, value] of Object.entries(formats))
          data.setData(type, value);
        document.body.dispatchEvent(
          new ClipboardEvent("paste", {
            clipboardData: data,
            bubbles: true,
            cancelable: true,
          }),
        );
        return read();
      },
      { ...input, guarded },
    );
  }
  const initial = Array.from({ length: 8 }, () => [
    "outside",
    "old ID",
    99,
    "outside",
  ]);
  const both = { productId: 0, quantity: 1 };
  // Each slot is either the expected write at that source row or a held row.
  const cases = [
    ["sheets-rounded-quantity", both, 0, [null]],
    ["sheets-single-number", { quantity: 0 }, 0, [{ quantity: 7 }]],
    ["sheets-product-codes", both, 1, [{ productId: "00123", quantity: 123 }]],
    ["sheets-product-codes", { productId: 1, quantity: 0 }, 1, [null]],
    [
      "sheets-mixed-blanks",
      { productId: 1, quantity: 2 },
      1,
      [
        { productId: "SKU-A", quantity: 11 },
        null,
        null,
        { productId: "SKU-Z", quantity: 0 },
        { productId: "SKU-D", quantity: 43 },
      ],
    ],
    ["excel-single-number", { quantity: 0 }, 0, [null]],
    ["excel-single-number", { productId: 0 }, 0, [{ productId: "7" }]],
    ["sheets-merged-header", both, 0, []],
  ];
  for (const [id, columns, headerRows, expected] of cases) {
    const { formats } = JSON.parse(
      readFileSync(new URL("../../fixtures/" + id + ".json", import.meta.url)),
    );
    const input = { formats, mapping: { columns, headerRows }, initial };
    const run = (guarded) =>
      page.evaluate(
        async ({ formats, mapping, initial, guarded }) => {
          const { tabulatorImporter, gridclipImporter } =
            await import("./adapters.js");
          const elements = [
            document.createElement("div"),
            document.createElement("div"),
          ];
          document.body.replaceChildren(...elements);
          const readTable = await tabulatorImporter(
            elements[0],
            mapping,
            guarded,
          );
          const readGrid = gridclipImporter(
            elements[1],
            mapping,
            guarded,
            initial,
          );
          for (const element of elements) {
            const data = new DataTransfer();
            for (const [type, value] of Object.entries(formats))
              data.setData(type, value);
            element.dispatchEvent(
              new ClipboardEvent("paste", {
                clipboardData: data,
                bubbles: true,
                cancelable: true,
              }),
            );
          }
          return { table: readTable(), sheet: readGrid() };
        },
        { ...input, guarded },
      );
    if (id === "sheets-rounded-quantity") {
      const baseline = await run(false);
      assert.equal(baseline.table.records[0].quantity, "7");
      assert.equal(baseline.sheet.grid[1][2], "7");
      const native = await runSpreadsheet(input, false);
      assert.equal(native.beforePasteCalls, 1);
      assert.equal(native.data[1][2], "7");
    }
    const { table, sheet } = await run(true);

    if (expected.length) {
      assert.deepEqual(
        table.preview.rows.map((row) =>
          row.status === "ready" ? row.values : null,
        ),
        expected,
      );
    } else assert.equal(table.preview.reason, "merged-cells");
    assert.deepEqual(
      JSON.parse(JSON.stringify(table.records)),
      expected.filter(Boolean),
    );
    const dest = structuredClone(initial);
    expected.forEach((row, i) => {
      if (row?.productId !== undefined) dest[i + 1][1] = row.productId;
      if (row?.quantity !== undefined) dest[i + 1][2] = row.quantity;
    });
    assert.deepEqual(sheet.grid, dest);
    const native = await runSpreadsheet(input, true);
    assert.equal(native.beforePasteCalls, 1);
    const atomic = expected.length && expected.every(Boolean) ? dest : initial;
    assert.deepEqual(
      native.data.map((row) => row.map(String)),
      atomic.map((row) => row.map(String)),
    );
    console.log(
      id,
      columns,
      expected.map((row) => (row === null ? "held" : "wrote")),
    );
  }
  // Same-instance ready → held → ready, followed by a paste without event
  // evidence. Jspreadsheet listens on document even with an external target.
  const sequence = [
    "sheets-single-number",
    "sheets-rounded-number",
    "sheets-single-number",
  ].map(
    (id) =>
      JSON.parse(
        readFileSync(
          new URL("../../fixtures/" + id + ".json", import.meta.url),
        ),
      ).formats,
  );
  for (const native of [false, true]) {
    await sheetPage.goto(page.url());
    const counts = await sheetPage.evaluate(
      async ({ native, sequence, initial }) => {
        const el = document.createElement("div");
        document.body.replaceChildren(el);
        const mapping = { columns: { quantity: 0 }, headerRows: 0 };
        const read = native
          ? (await import("./jspreadsheet.js")).spreadsheetImporter(
              el,
              mapping,
              true,
              initial,
            )
          : await (
              await import("./adapters.js")
            ).tabulatorImporter(el, mapping, true);
        const counts = [];
        for (const formats of [...sequence, null]) {
          const clipboardData = formats && new DataTransfer();
          for (const [type, value] of Object.entries(formats ?? {}))
            clipboardData.setData(type, value);
          (native ? document.body : el).dispatchEvent(
            new ClipboardEvent("paste", {
              clipboardData,
              bubbles: true,
              cancelable: true,
            }),
          );
          counts.push(native ? read().pasteCommits : read().records.length);
        }
        if (native) {
          el.jspreadsheet.paste(2, 1, "999");
          if (read().data[1][2] !== "7" || read().pasteCommits !== 2)
            throw Error("Stale clipboard preview reused");
        }
        return counts;
      },
      { native, sequence, initial },
    );
    assert.deepEqual(counts, [1, 1, 2, 2]);
  }
  console.log("Consecutive paste and stale-event regressions passed");
} finally {
  await browser?.close();
  await server.close();
}
