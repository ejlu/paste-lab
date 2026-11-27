# Paste Lab

An in-browser clipboard inspector for people building spreadsheets, grids and rich-text editors. Pick a real Excel or Google Sheets fixture, inspect its clipboard formats, and click a parsed cell to see its exact string and Unicode code points. Pasted data stays in your browser, including on the hosted demo.

[**Try the live demo →**](https://ejlu.github.io/paste-lab/)

In the inventory preview, try the [leading-zero product ID](https://ejlu.github.io/paste-lab/?fixture=sheets-product-codes#importer), then compare the [rounded quantity](https://ejlu.github.io/paste-lab/?fixture=sheets-rounded-quantity#importer) with a [literal 7](https://ejlu.github.io/paste-lab/?fixture=sheets-single-number#importer). Both quantities display as `7`. The preview holds the stored `7.4` for review and accepts the stored `7`.

![Paste Lab inspecting a multiline Google Sheets cell](docs/workbench.png)

## TypeScript package

```sh
npm install paste-lab
```

Use `compareClipboardFormats` to inspect displayed strings and available stored values before importing a paste. [Package API and example](packages/paste-lab/README.md)

In a Chromium trial with Tabulator’s range-paste importer, the [rounded inventory capture](fixtures/sheets-rounded-quantity.json) pasted as `SKU-R / 7`. With the helper, a whole-unit quantity check saw the stored `7.4` and held the row for review. A [literal seven](fixtures/sheets-single-number.json) passed the same check.

For inventory imports, `paste-lab/inventory` previews product IDs and whole-unit quantities. The live Google Sheets keyboard trial in Tabulator and Jspreadsheet CE held a rounded `7.4` and accepted a literal `7`, even though both pasted as the text `7`. [Inventory API and example](packages/paste-lab/README.md#inventory-preview)

To test a locally built tarball, start from the repository root and run `npm ci`, then `npm run pack:lib` and `npm run test:package -- ./paste-lab-0.2.0.tgz`. The consumer test installs that archive in a fresh directory, compiles with strict NodeNext settings, and runs the fixture checks against the installed entry point.

## Run locally

Use Node.js 22.12+ or a current LTS release.

```sh
npm ci
npm run dev
```

Open the local address printed by Vite. Choose **Product codes** and switch between the Excel and Google Sheets examples. Both cells display `00123`. The Sheets compact-table payload also contains the number `123` and the custom format `00000`.

## Capture a regression

1. Copy a range, focus **Inspect your clipboard**, and paste. The app reads the string formats exposed by that paste event. Reloading clears your live capture.
2. Choose a format. Plain text and HTML produce a grid. Other string formats have a raw view. Enable **Show whitespace** to see spaces (·), nonbreaking spaces (⍽), tabs (⇥), CR (␍), and LF (↵).
3. Select **Save fixture**, choose the clipboard formats to include, name the capture, and fill in its source labels. Enter expected grids independently or choose **Use current parser output** and review the result.
4. Download the JSON, place it in `fixtures/`, and run `npm test`. The test runner discovers it automatically. The fixture library includes it the next time the app builds.

For a format that fails to parse, use an expectation such as `{"error":"no-table"}`. The runner checks the stable parser error code and continues to test the other formats.

The grid shows whether each parsed format matches its saved expectation. Use the arrow keys to move between cells. **My latest paste** restores your capture after exploring the library.

The dialog preselects plain text, HTML, and Google Sheets compact-table data when present. Other captured string formats are opt-in. The JSON lists only selected formats and preserves their original strings, including line endings. The capture details in the workbench still list all advertised types. Binary file contents are never captured. Pasted data stays in memory. Review payloads before publishing them since spreadsheet HTML and custom formats can include local paths, formulas and document identifiers.

## Clipboard fixtures

| Fixture | What to inspect |
| --- | --- |
| [Excel product codes](fixtures/excel-product-codes.json) | The formatted number and text ID display alike. The Excel stylesheet contains the five-digit format. |
| [Sheets product codes](fixtures/sheets-product-codes.json) | The same two display strings appear in TSV. Inspect the compact-table format to see the underlying number. |
| [Sheets multiline cell](fixtures/sheets-multiline-cell.json) | A quoted LF in TSV and a `br` in HTML both leave Maya at C2. |
| [Excel empty edges](fixtures/excel-empty-edges.json) | A 3 × 4 range includes a blank middle row and three trailing empty cells. |
| [Sheets merged header](fixtures/sheets-merged-header.json) | Compare the empty B1 field in TSV with the two-column HTML span anchored at A1. |
| [Excel significant whitespace](fixtures/excel-significant-whitespace.json) | The third cell ends with U+0020 in plain text and U+00A0 inside an Excel spacerun in HTML. |

Each JSON includes the recreation recipe, source, captured formats and hand-authored expectations for each grid parser. The examples use invented data. Excel 16.115.2 captures came from the macOS native pasteboard's text and HTML representations. Two local file URL prefixes in each Excel HTML sample were redacted. Sheets captures came through a Chrome 158 paste event on the same Mac. The original Sheets fixtures list advertised private types as provenance and retain text, HTML and compact-table JSON. Re-exporting any fixture through the dialog lists only the selected payload types in the new JSON.

### Inventory importer results

These seven pairs were copied from Google Sheets and Microsoft Excel using invented inventory rows on the same Mac. Select either fixture in the local workbench to inspect the captured representations and mapped row. The tests use column A for the ID and B for quantity. The single-cell case maps the same cell to both fields.

| Copied range | Google Sheets | Excel |
| --- | --- | --- |
| Repeated IDs and counts, then zero | Imports all three rows in order with quantities 7, 7 and 0. [Capture](fixtures/sheets-duplicate-counts.json) | Displays agree. Quantity requires review. [Capture](fixtures/excel-duplicate-counts.json) |
| Same range plus a final blank count | The first three rows still import as 7, 7 and 0. Only the row with the blank count requires review. [Capture](fixtures/sheets-blank-count.json) | Preserves the blank. All four rows require review. [Capture](fixtures/excel-blank-count.json) |
| One numeric cell containing 7 | The marked HTML span and plain text agree with the stored number. Mapping the cell to both fields yields ID `"7"` and quantity `7`. [Capture](fixtures/sheets-single-number.json) | HTML contains a table. Quantity still requires review. [Capture](fixtures/excel-single-number.json) |
| Formula `=3+4` | Displays 7. The helper skips the formula layout and requests review. [Capture](fixtures/sheets-formula-count.json) | Displays 7 and requests review. [Capture](fixtures/excel-formula-count.json) |
| Percentage `25%` | Reads the stored 0.25 and rejects it as a whole-unit count. [Capture](fixtures/sheets-percent.json) | Displays 25% and requests review. [Capture](fixtures/excel-percent.json) |
| Date entered as `2026-01-15` | Reads serial 46037. The displayed date prevents importing it as a quantity. [Capture](fixtures/sheets-date.json) | Displays 1/15/26 and requests review. [Capture](fixtures/excel-date.json) |
| Boolean `TRUE` | Displays TRUE. The adapter skips the boolean encoding and requests review. [Capture](fixtures/sheets-boolean.json) | Displays TRUE and requests review. [Capture](fixtures/excel-boolean.json) |

The [rounded-number capture](fixtures/sheets-rounded-number.json) contains a numeric `7.4` formatted to zero decimal places. Its plain text and HTML are identical to the [literal seven capture](fixtures/sheets-single-number.json). In the [inventory row](fixtures/sheets-rounded-quantity.json), a plain-text importer that accepts digit-only safe integers imports `SKU-R` with quantity `7`. The comparison helper reports display `"7"` and stored number `7.4`. The inventory importer requires whole units and sends the row to review.

The [single-column trailing blank](fixtures/sheets-trailing-blank-column.json) copies K41:K42 with 37 above an empty cell. Its plain text is `"37\n"`. The HTML and compact data each confirm the second row. The comparison keeps both cells, while the standalone TSV parser reads one terminated record.

The [mixed-blanks Sheets capture](fixtures/sheets-mixed-blanks.json) has five empty cells in a 6 × 4 range, including A1 and the consecutive pair B4:C4. Map B to Product ID and C to Quantity. Rows 2, 5 and 6 import as `SKU-A / 11`, `SKU-Z / 0` and `SKU-D / 43`. Row 3 needs a quantity. Row 4 needs both fields.

All seven Excel results have the same underlying limitation. The helper reads the captured text and HTML as displays and currently obtains typed values only from Sheets compact data. These samples cover one Chrome/macOS Sheets setup and desktop Excel for Mac.

## Plug in your parser

`parseFormat(mimeType, rawString)` in [src/parser.ts](src/parser.ts) returns `{ rows, merges }`. Both the UI and the tests call it. Cell values are strings, including empty strings. A covered merge position is `null`. A merge records its zero-based `row` and `column`, plus its `width` and `height`. Ragged rows retain their lengths.

The TSV reader handles tabs, quoted fields, doubled quotes and CR/LF/CRLF. A quote at the start of a field opens a quoted field. Malformed quotes produce an error and preserve the raw input for inspection. A final record separator closes the final row. The HTML reader uses parse5, reads the first table or a single Sheets root span, decodes entities and maps `br` to LF. It preserves source text whitespace and does not apply spreadsheet CSS or infer numeric types. Zero or invalid spans default to one. Grid previews are bounded at 20,000 positions and one million UTF-16 units per format. Larger raw captures can still be inspected in excerpt and exported with a limit-error expectation.

```sh
npm test
npm run build
```

To exercise the regression suite, replace the TSV parser temporarily with a split on newlines and tabs. The multiline fixture will fail because the second line of B2 becomes a new row. Restore the reference parser to get back to green.

MIT licensed.

For the browser checks, run `npx playwright install chromium` followed by `npm run test:browser`. They exercise a live page, fixture downloads and the mobile layout.

## Product IDs and quantities

Choose **Product ID · 00123** in **Inventory import preview**. Row 2 displays `00123` in both columns. With A mapped to Product ID and B to Quantity, the importer emits `{"productId":"00123","quantity":123}`. Map B to both fields to see the same cell imported two ways. Map A to Quantity to see a text-only quantity sent for review.

[compareClipboardFormats](src/importer.ts) compares plain text, HTML table text and typed values by cell position. The Sheets captures show a single numeric cell, runs of populated cells, and leading, interior, consecutive and trailing blanks. Explicit blanks have `stored: null` and `storedBlank: true`. A blank consumes a grid position without consuming a typed value. This is an undocumented format. Unsupported layouts and missing metadata leave the stored value unavailable. The comparison returns per-cell evidence, a status for each format in `formats`, and an `alignment` result. A malformed TSV leaves the HTML grid available for inspection. Merged or differently shaped display grids cannot be mapped safely and produce no aligned cells.

The inventory example keeps product IDs exactly as displayed, including leading zeros. Different displayed IDs or a contradiction with the stored text require review. For numeric IDs and quantities, the available displays must agree character for character and spell the stored nonnegative safe integer using decimal digits, with optional leading zeros. A quantity also requires a stored number. For example, displayed `00123` and stored `999` require review.

One display plus aligned Sheets metadata can suffice when the other display is missing or HTML has no table. An empty, malformed or over-limit display leaves the surviving evidence visible and sends the row to review. The preview maps one data row at a time and treats the first row of a multirow paste as column names.
