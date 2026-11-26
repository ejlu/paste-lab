import { parseFormat, ParseError } from "./parser.ts";
import type { Grid } from "./types.ts";

export const sheetsCompact =
  "application/x-vnd.google-spreadsheet-compact-table+json";

export interface CellEvidence {
  plain: string | null;
  html: string | null;
  stored: string | number | null;
  differences: ("display-text" | "stored-text" | "formatted-number")[];
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// This is a narrow adapter for the observed dense, row-major Sheets encoding.
// A type stream addresses separate text and number pools. Reject other layouts
// rather than attaching an interesting-looking number to the wrong cell.
function storedValues(
  raw: string,
  height: number,
  width: number,
): (number | string)[] | null {
  if (raw.length > 1_000_000) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (
    !record(data) ||
    data["1"] !== 1 ||
    !record(data["15"]) ||
    !record(data["3"])
  )
    return null;
  const count = height * width;
  const layout = data["2"];
  if (
    data["15"]["1"] !== height ||
    data["15"]["2"] !== width ||
    !Array.isArray(layout) ||
    layout.length !== 2 ||
    layout[0] !== -count ||
    layout[1] !== 195
  )
    return null;
  const slots = data["3"];
  const kinds = slots["1"],
    numbers = slots["3"] ?? [],
    strings = slots["4"] ?? [];
  if (
    !Array.isArray(kinds) ||
    kinds.length !== count ||
    !Array.isArray(numbers) ||
    !Array.isArray(strings)
  )
    return null;
  const values: (number | string)[] = [];
  let numberIndex = 0,
    stringIndex = 0;
  for (const kind of kinds) {
    if (kind === 1) {
      const value: unknown = numbers[numberIndex++];
      if (typeof value !== "number" || !Number.isFinite(value)) return null;
      values.push(value);
    } else if (kind === 2 || kind === 4) {
      const value: unknown = strings[stringIndex++];
      if (typeof value !== "string") return null;
      values.push(value);
    } else return null;
  }
  return numberIndex === numbers.length && stringIndex === strings.length
    ? values
    : null;
}

export interface ClipboardComparison {
  cells: CellEvidence[][];
  note: string;
}

export function compareClipboardFormats(
  formats: Readonly<Record<string, string>>,
): ClipboardComparison {
  const parsed: Partial<Record<"text/plain" | "text/html", Grid>> = {};
  for (const type of ["text/plain", "text/html"] as const) {
    if (!Object.hasOwn(formats, type)) continue;
    try {
      parsed[type] = parseFormat(type, formats[type]);
    } catch (error) {
      if (error instanceof ParseError && error.code === "no-table") continue;
      if (!(error instanceof ParseError)) throw error;
      return { cells: [], note: type + ": " + error.message };
    }
  }
  const plain = parsed["text/plain"],
    html = parsed["text/html"];
  const rows = (plain ?? html)?.rows;
  if (!rows?.length) return { cells: [], note: "No tabular display data." };
  if (
    html?.merges.length ||
    (plain &&
      html &&
      (plain.rows.length !== html.rows.length ||
        plain.rows.some((row, r) => row.length !== html.rows[r].length)))
  ) {
    return {
      cells: [],
      note: "The importer requires unmerged cells with matching row and column positions.",
    };
  }
  const width = rows[0].length;
  const compact = formats[sheetsCompact];
  const values =
    compact && rows.every((row) => row.length === width)
      ? storedValues(compact, rows.length, width)
      : null;
  const note = values
    ? ""
    : compact !== undefined
      ? "Unrecognized Sheets layout. Stored values are unavailable."
      : "This capture has no Sheets stored-value data.";
  const cells = rows.map((row, r) =>
    row.map((_, c): CellEvidence => {
      const text = plain?.rows[r][c] ?? null,
        markup = html?.rows[r][c] ?? null;
      const stored = values?.[r * width + c] ?? null;
      const differences: CellEvidence["differences"] = [];
      if (text !== null && markup !== null && text !== markup)
        differences.push("display-text");
      const displays = [text, markup].filter((v) => v !== null);
      if (
        typeof stored === "number" &&
        displays.some((v) => v !== String(stored))
      )
        differences.push("formatted-number");
      if (typeof stored === "string" && displays.some((v) => v !== stored))
        differences.push("stored-text");
      return { plain: text, html: markup, stored, differences };
    }),
  );
  return { cells, note };
}

export type InventoryImport =
  | { status: "ready"; record: { productId: string; quantity: number } }
  | { status: "review"; issues: string[] };

export function importInventoryRow(
  id: CellEvidence,
  qty: CellEvidence,
): InventoryImport {
  const productId = id.plain ?? id.html;
  const quantity = qty.stored;
  const issues: string[] = [];
  if (!productId?.trim()) issues.push("Product ID needs a displayed value.");
  if (id.differences.includes("display-text"))
    issues.push(
      "Product ID needs review because the two displayed strings differ.",
    );
  if (typeof quantity !== "number")
    issues.push(
      "Quantity needs a stored number. Digit-only text needs review.",
    );
  else if (!Number.isSafeInteger(quantity) || quantity < 0)
    issues.push("Quantity must be a nonnegative safe integer.");
  if (issues.length || !productId || typeof quantity !== "number")
    return { status: "review", issues };
  return { status: "ready", record: { productId, quantity } };
}
