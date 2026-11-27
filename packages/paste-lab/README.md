# paste-lab

Compare the representations of a spreadsheet paste before importing its cells. A Google Sheets cell containing `7.4` can display and paste as `7` in both text and HTML. When Sheets also supplies supported compact-table data, this helper reports the displayed strings and the stored number at the same coordinate.

## Install

```sh
npm install paste-lab
```

The package exports ES modules and TypeScript declarations. It takes a map of MIME types to their original strings. In a browser, collect only the types actually present on the paste event.

```ts
import { compareClipboardFormats, sheetsCompact } from "paste-lab";

document.addEventListener("paste", (event) => {
  const data = event.clipboardData;
  if (!data) return;
  const formats = Object.fromEntries(
    Array.from(data.types, (type) => [type, data.getData(type)])
  );
  const result = compareClipboardFormats(formats);
  if (result.alignment !== "aligned") return;
  const cell = result.cells[0]?.[0];
  if (!cell || result.formats[sheetsCompact] !== "available") return;
  // A whole-unit importer can send a fractional stored number to review.
  if (typeof cell.stored === "number" && !Number.isInteger(cell.stored)) {
    console.log("Check quantity", cell.plain, cell.stored);
  }
});
```

## Interpret the evidence

- `plain` and `html` are displayed strings, or `null` for an unavailable representation. The helper reads TSV, the first HTML table, or a single Sheets root span.
- `stored` is the decoded number or string. A confirmed blank has `stored: null` and `storedBlank: true`. Other nulls mean the stored value is unknown. The Excel captures supply display evidence only.
- `differences` lists exact spelling differences. Both `00123` paired with numeric `123` and `7` paired with `7.4` produce `stored-number`. An empty list means the available evidence has no observed difference. Missing formats can hide loss of precision. Keep identifier and quantity rules in the calling app.
- Inspect `formats` for missing, empty, malformed, unsupported, or over-limit input. `alignment` describes the display grids. Merged cells, mismatched display shapes, or no usable display yield no comparison cells. With an aligned display and unusable compact data, the display cells remain available.
- A final TSV newline can terminate a record or represent a blank single-column cell. The comparison preserves that extra cell when a matching HTML column has one final empty row, or, without a usable HTML grid, when aligned Sheets metadata explicitly marks it blank. Plain text alone keeps its usual record-terminator interpretation.
- Stored values come from observed layouts of Google's undocumented compact-table format. An unsupported formula or boolean layout leaves stored values unavailable across the range. Dates and percentages can be raw numbers. Each format is limited to one million UTF-16 code units and parsed grids to 20,000 positions.

The comparison function, the `sheetsCompact` MIME constant, and the types `ClipboardComparison`, `CellEvidence`, `DisplayStatus`, and `CompactStatus` form the public API. The fixtures cover Sheets in Chrome on macOS and desktop Excel for Mac. [Live clipboard inspector](https://ejlu.github.io/paste-lab/)

MIT licensed.
